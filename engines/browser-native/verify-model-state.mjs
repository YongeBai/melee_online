import {inspectArchive} from './archive.mjs';
import {readNativeModelMatrices} from './native-model.mjs';
import {readNativeTextures} from './native-texture.mjs';

// Cross-check the shared skin palette against the original PObj setup methods.
// It is intentionally a draw-time oracle, not the production per-frame path.
export function createNativeModelProbe(module,model,bytes,nodes,skin,owner=0) {
  const archive=inspectArchive(bytes),d=archive.data;
  function indexOf(first,target) {
    for(let index=0,at=first;at!==null&&index<4096;index++) {
      if(at===target)return index;at=archive.relocations.has(at+4)?d.getUint32(at+4):null;
    }
    throw Error('Native model draw ownership');
  }
  const plans=model.meshes.map(mesh=>({joint:mesh.joint,display:indexOf(model.tree.nodes[mesh.joint].display,mesh.dobj),
    polygon:indexOf(d.getUint32(mesh.dobj+12),mesh.pobj)}));
  const view=module._malloc(48),positions=module._malloc(skin.groupCount*48),normals=module._malloc(skin.groupCount*48);
  if(!view||!positions||!normals){for(const p of [view,positions,normals])if(p)module._free(p);throw Error('Native model probe allocation');}
  return {
    check(rows) {
      module.__dirtyMark?.(view,rows.length*4);module.HEAPF32.set(rows,view/4);module._portSkinViewMatrices(skin.groupCount,view,skin.matrices,positions,normals);
      let matrixChecks=0,normalChecks=0,reflectionChecks=0,maxPositionError=0,maxNormalError=0;
      const compare=(actual,expected,kind)=>{
        for(let i=0;i<actual.length;i++) {
          if(kind==='normal'&&i%4===3)continue;const error=Math.abs(actual[i]-expected[i])/(1+Math.abs(expected[i]));
          if(!Number.isFinite(error)||error>0.00004)throw Error(`Original PObj ${kind} mismatch at ${i}: ${actual[i]} vs ${expected[i]}`);
          if(kind==='position')maxPositionError=Math.max(maxPositionError,error);else maxNormalError=Math.max(maxNormalError,error);
        }
      };
      for(const [meshIndex,plan] of plans.entries()) {
        const joint=new Uint32Array(module.HEAPU8.buffer,nodes,model.tree.nodes.length)[plan.joint];
        module._portMaterialDrawState(joint,plan.display,plan.polygon,view,owner);
        const native=readNativeModelMatrices(module),textures=readNativeTextures(module),palette=skin.bindings.meshPalettes[meshIndex];
        for(const [slot,group] of palette.entries()) {
          if(!native.positions[slot])throw Error('Original PObj missing position palette');
          const expectedPosition=module.HEAPF32.subarray(positions/4+group*12,positions/4+(group+1)*12),expectedNormal=module.HEAPF32.subarray(normals/4+group*12,normals/4+(group+1)*12);
          compare(native.positions[slot],expectedPosition,'position');matrixChecks++;
          if(native.normals[slot]){compare(native.normals[slot],expectedNormal,'normal');normalChecks++;}
          const reflection=textures.generators.some(g=>g.source===1&&g.matrix===30)?textures.matrices.find(m=>m.id===30+slot*3):null;
          if(reflection){compare(reflection.values,expectedNormal,'reflection');reflectionChecks++;}
        }
      }
      return {draws:plans.length,matrixChecks,normalChecks,reflectionChecks,maxPositionError,maxNormalError};
    },dispose(){for(const p of [view,positions,normals])module._free(p);},
  };
}
