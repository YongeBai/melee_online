import {convertCharacterCollision} from './character-collision-assets.mjs';
import {installResidentFile,openResidentArchive} from './resident-files.mjs';
import {loadSceneAsset,loadSceneAnimation} from './scene-assets.mjs';
import {animationArchives} from './animation-assets.mjs';
import {motionSpec} from './motion-spec.mjs';

export function verifyCharacterCollision(module,fighters,models,animations) {
  const rows=[],allocations=module._portFileAllocations(),objects=module._portRuntimeObjectsUsed();
  let capacityChecks=0;
  const view=()=>new DataView(module.HEAPU8.buffer),ptr=at=>view().getUint32(at,true);
  const maps=module._portSharedGlobal(4),groups=module._portSharedGlobal(5);
  if(!maps||!groups)throw Error('Common initialization required before collision');
  for(const {name,bytes} of fighters) {
    const code=name.slice(2,4),kind=motionSpec.codes.indexOf(code);
    if(kind<0||kind>=27)throw Error('Unsupported collision fighter');
    const map=ptr(maps+kind*4),partCount=ptr(map+8);
    const converted=convertCharacterCollision(bytes,name,partCount),model=models.find(m=>m.name===name.replace('.dat','Nr.dat')),
      animation=animations.find(m=>m.name===name.replace('.dat','AJ.dat'));
    if(!model||!animation)throw Error('Hosted collision model/animation missing');
    const asset=loadSceneAsset(module,model.bytes),n=asset.model.tree.nodes.length;
    if(asset.model.tree.nodes.some(node=>node.flags&0x1000))throw Error('Instance joints require explicit part mapping');
    const group=ptr(groups+kind*4),skip=new Set();
    if(group){const start=ptr(group),count=ptr(group+4);for(let i=0;i<count;i++)skip.add(module.HEAPU8[start+i*4]);}
    const partNodes=[];let node=0;for(let part=0;part<partCount;part++)partNodes.push(skip.has(part)?-1:node++);
    if(node!==n)throw Error('Collision part mapping mismatch: '+name+' '+node+' != '+n);
    const first=animationArchives(animation.bytes,true).next().value;
    const length=new DataView(animation.bytes.buffer,animation.bytes.byteOffset+first.offset,4).getUint32(0);
    const clip=loadSceneAnimation(module,animation.bytes.subarray(first.offset,first.offset+length));
    const nodes=module._malloc(n*4),parts=module._malloc(partCount*4),matrices=module._malloc(n*48);
    let file,object;let maxError=0,reads=0;const frames=32;
    try {
      installResidentFile(module,name,converted.image);file=openResidentArchive(module,name,['native_character_collision']);
      object=module._portSceneObjectCreate(asset.root);const root=module._portSceneObjectRoot(object);
      if(module._portSceneCollect(root,nodes,n)!==n)throw Error('Collision scene node count mismatch');
      for(let part=0;part<partCount;part++)view().setUint32(parts+part*4,partNodes[part]<0?0:ptr(nodes+partNodes[part]*4),true);
      if(module._portCollisionAttach(object,file.addresses[0],partCount,parts,kind)!==0)throw Error('Original collision initialization rejected: '+name);
      let displayCount=0;const depths=[];
      for(const [i,node] of asset.model.tree.nodes.entries())depths[i]=node.parent<0?0:depths[node.parent]+1;
      for(let part=0;part<partCount;part++) {
        const index=partNodes[part];
        if(module._portCollisionPartRead(object,part,0)!==ptr(parts+part*4))throw Error('Original part-to-joint mapping mismatch');
        if(index<0)continue;
        const node=asset.model.tree.nodes[index],displays=new Set(asset.model.meshes.filter(m=>m.joint===index).map(m=>m.dobj)).size;
        displayCount+=displays;
        const flags=[7,8,16,18,20,19].reduce((value,bit,i)=>value|((node.flags>>>bit&1)<<i),0);
        for(const [field,expected] of [[1,depths[index]],[2,Math.max(0,displayCount-1)],[3,1],[6,flags],[7,Number(displays>0)]])
          if(module._portCollisionPartRead(object,part,field)!==expected)throw Error('Original part metadata mismatch: '+name+'/'+part+'/'+field);
      }
      if(module._portCollisionPartRead(object,0,4)!==displayCount||module._portCollisionPartRead(object,0,5)!==displayCount)
        throw Error('Original display list or fighter material class mismatch');
      const read=(i,f)=>{reads++;return module._portCollisionRead(object,i,f);};
      function same(i,f,value){if(!Object.is(read(i,f),value))throw Error('Original collision descriptor mismatch: '+name+'/'+i+'/'+f);}
      same(0,0,converted.hurtboxes.length);same(0,1,converted.dynamicColliders.length);
      for(const [i,row] of converted.hurtboxes.entries()) {
        row.forEach((value,j)=>same(i,j+2,value));same(i,12,ptr(parts+row[0]*4));same(i,13,0);
      }
      for(const [i,row] of converted.dynamicColliders.entries()) {
        same(i,30,row[0]);same(i,31,ptr(parts+row[0]*4));row.slice(1).forEach((value,j)=>same(i,j+32,value));
      }
      if(module._portSceneAnimation(n,nodes,clip.tree)!==0)throw Error('Collision animation attachment failed');module._portSceneRequest(root);
      const record=[];
      for(let pass=0;pass<2;pass++) {
        if(pass)module._portSceneRequest(root);
        for(let frame=0;frame<frames;frame++) {
          module._portSceneAnimate(root);module._portSceneMatrices(n,nodes,matrices);module._portCollisionReset(object);
          for(let i=0;i<converted.hurtboxes.length;i++)same(i,14,0);
          module._portCollisionWorld(object);
          for(const [i,row] of converted.hurtboxes.entries()) {
            same(i,14,1);const matrix=module.HEAPF32.subarray(matrices/4+partNodes[row[0]]*12,matrices/4+partNodes[row[0]]*12+12);
            for(let end=0;end<2;end++)for(let axis=0;axis<3;axis++) {
              const p=row.slice(3+end*3,6+end*3),at=axis*4;
              const expected=Math.fround(Math.fround(Math.fround(Math.fround(matrix[at]*p[0])+Math.fround(matrix[at+1]*p[1]))+Math.fround(matrix[at+2]*p[2]))+matrix[at+3]);
              const value=read(i,15+end*3+axis),error=Math.abs(value-expected);maxError=Math.max(maxError,error);
              if(!Number.isFinite(value)||error>0.00001*(1+Math.abs(expected)))throw Error('Original world hurtbox mismatch: '+name+'/'+i+'/'+frame);
              const key=frame*converted.hurtboxes.length*6+i*6+end*3+axis;
              if(!pass)record[key]=value;else if(!Object.is(value,record[key]))throw Error('Hurtbox rewind mismatch');
            }
          }
          // Cached second call must leave positions identical.
          module._portCollisionWorld(object);
          for(let i=0;i<converted.hurtboxes.length;i++)for(let j=0;j<6;j++)same(i,15+j,record[frame*converted.hurtboxes.length*6+i*6+j]);
        }
      }
      rows.push({name,partCount,reservedParts:skip.size,originalParts:true,fighterMaterials:displayCount,hurtboxes:converted.hurtboxes.length,dynamicColliders:converted.dynamicColliders.length,frames,reads,maxWorldError:maxError,rewindPassed:true});
      if(kind===0) {
        // Exercise the real eleven-entry limit, not only the retail corpus's
        // zero/one dynamics colliders. Keep this synthetic fixture separate.
        module._portSceneObjectFree(object);object=0;
        const synthetic=module._malloc(16+11*20),bone=converted.hurtboxes[0][0];
        try {
          object=module._portSceneObjectCreate(asset.root);
          const root=module._portSceneObjectRoot(object);module._portSceneCollect(root,nodes,n);
          for(let part=0;part<partCount;part++)view().setUint32(parts+part*4,partNodes[part]<0?0:ptr(nodes+partNodes[part]*4),true);
          for(const [i,value] of [0,0,12,synthetic+16].entries())view().setUint32(synthetic+i*4,value,true);
          if(module._portCollisionAttach(object,synthetic,partCount,parts,kind)!==-1)throw Error('Dynamics collider capacity was not enforced');
          view().setUint32(synthetic+8,11,true);
          for(let i=0;i<11;i++) {
            view().setUint32(synthetic+16+i*20,bone,true);
            for(let j=0;j<4;j++)view().setFloat32(synthetic+20+i*20+j*4,(i+1)*(j+0.25),true);
          }
          if(module._portCollisionAttach(object,synthetic,partCount,parts,kind)!==0)throw Error('Full collider capacity rejected');
          same(0,0,0);same(0,1,11);
          for(let i=0;i<11;i++) {
            same(i,30,bone);same(i,31,ptr(parts+bone*4));
            for(let j=0;j<4;j++)same(i,32+j,(i+1)*(j+0.25));capacityChecks++;
          }
        } finally {if(object){module._portSceneObjectFree(object);object=0;}module._free(synthetic);}
      }
    } finally {
      if(object)module._portSceneObjectFree(object);file?.dispose();clip.dispose();asset.dispose();for(const p of [nodes,parts,matrices])module._free(p);
      if(module._portFileClear()!==0)throw Error('Collision fixture retained file cache');
    }
    if(module._portFileAllocations()!==allocations||module._portRuntimeObjectsUsed()!==objects||module._portSceneLiveObjects())throw Error('Collision fixture owner leaked');
  }
  return {passed:true,rows,capacityChecks,hurtboxes:rows.reduce((n,r)=>n+r.hurtboxes,0),frames:rows.reduce((n,r)=>n+r.frames,0),
    limitation:'Original part/material class setup and collision initialization/reset/world positions; limited Fighter context, no combat, dynamic-bone simulation or material drawing'};
}
