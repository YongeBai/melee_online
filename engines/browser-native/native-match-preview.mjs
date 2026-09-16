import {readModelMeshes} from './mesh-assets.mjs';
import {readModelMaterials} from './material-assets.mjs';
import {inspectArchive} from './archive.mjs';
import {readSkinBindings,loadSkin} from './skin-assets.mjs';
import {textureMatrices} from './texture-matrix.mjs';
import {createMeshPipeline,uploadMesh} from './gpu-mesh.mjs';
import {createNativeCamera,checkNativeCamera} from './native-camera.mjs';
import {readNativeTev} from './native-tev.mjs';

// Inspection bridge, not the gameplay renderer: native live poses, visibility
// and camera, with the existing diagnostic first-UV shader. No simulation edits.
export function createNativeMatchPreview(module,canvas,actors) {
  const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:true,preserveDrawingBuffer:true});
  if(!gl)throw Error('Native preview needs WebGL2');
  const camera=createNativeCamera(module),pipeline=createMeshPipeline(gl),resources=[];
  function dispose(){for(const r of resources){r.gpu.dispose();r.skin.dispose();for(const p of r.allocations)module._free(p);}pipeline.dispose();camera.dispose();}
  try {
    for(const actor of actors) {
      const model=readModelMeshes(actor.bytes);if(!model.meshes.length)continue;
      const archive=inspectArchive(actor.bytes),d=archive.data,extra=actor.extraRoot??0,n=model.tree.nodes.length;
      const allocations=[],alloc=size=>{const p=module._malloc(size);if(!p)throw Error('Preview allocation');allocations.push(p);return p;};
      let skin,gpu;
      try {
        const collected=alloc((n+extra)*4),nodes=collected+extra*4,flags=alloc(n*4),indices=alloc(model.meshes.length*4),visible=alloc(model.meshes.length*4);
        if(module._portSceneCollect(module._portSceneObjectRoot(actor.object),collected,n+extra)!==n+extra)throw Error('Live preview hierarchy mismatch');
        const specs=new Uint16Array(module.HEAPU8.buffer,indices,model.meshes.length*2);
        model.meshes.forEach((mesh,i)=>{
          let at=model.tree.nodes[mesh.joint].display,index=0;
          while(at!==mesh.dobj){if(at===null||index++>=4096)throw Error('Preview DObj ownership');at=archive.relocations.has(at+4)?d.getUint32(at+4):null;}
          specs[i*2]=mesh.joint;specs[i*2+1]=index;
        });
        const assets=readModelMaterials(actor.bytes,model);
        skin=loadSkin(module,model,readSkinBindings(actor.bytes,model),{referenceVertices:true});
        gpu=uploadMesh(gl,pipeline,model,skin,assets,textureMatrices(module,assets.textures));
        resources.push({name:actor.name,prepare:actor.prepare,model,skin,gpu,nodes,flags,indices,visible,allocations});
      } catch(error){gpu?.dispose();skin?.dispose();for(const p of allocations)module._free(p);throw error;}
    }
    return {
      draw(){
        const snapshot=camera.snapshot();checkNativeCamera(snapshot);
        gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
        const rows=[],programs=new Map();
        for(const r of resources) {
          const {model,skin,gpu,nodes,flags,indices,visible}=r;
          const show=r.prepare?r.prepare():true;
          module._portSceneMatrices(model.tree.nodes.length,nodes,skin.world);
          module._portSceneFlags(model.tree.nodes.length,nodes,flags);
          module._portSceneMeshVisibility(model.meshes.length,nodes,indices,visible);
          const seen=new Set();
          for(let i=0;i<model.meshes.length;i++) {
            const mesh=model.meshes[i];if(seen.has(mesh.dobj))continue;seen.add(mesh.dobj);
            const specs=new Uint16Array(module.HEAPU8.buffer,indices,model.meshes.length*2);
            const joint=new Uint32Array(module.HEAPU8.buffer,nodes,model.tree.nodes.length)[specs[i*2]];
            const program=readNativeTev(module,joint,specs[i*2+1]),key=JSON.stringify(program.stages);
            if(!programs.has(key))programs.set(key,{program,materials:0});programs.get(key).materials++;
          }
          skin.step();gpu.updatePalette(module.HEAPF32.subarray(skin.matrices/4,skin.matrices/4+skin.groupCount*12));
          const draws=show?gpu.draw(snapshot.view,snapshot.projection,new Uint32Array(module.HEAPU8.buffer,flags,model.tree.nodes.length),new Uint32Array(module.HEAPU8.buffer,visible,model.meshes.length)):0;
          if(r.prepare&&!draws)throw Error('Native fighter preview has no visible body meshes');
          const positions=gpu.readPositions(),reference=module.HEAPF32.subarray(skin.transformed/4,skin.transformed/4+positions.length);
          let maxScaledVertexError=0;
          for(let i=0;i<positions.length;i++) {
            const error=Math.abs(positions[i]-reference[i])/(1+Math.abs(reference[i]));
            if(!Number.isFinite(error)||error>0.00002)throw Error('Live native/GPU vertex mismatch');
            maxScaledVertexError=Math.max(maxScaledVertexError,error);
          }
          rows.push({name:r.name,joints:model.tree.nodes.length,meshes:model.meshes.length,draws,vertices:positions.length/3,maxScaledVertexError});
        }
        if(gl.getError()!==gl.NO_ERROR)throw Error('Native match preview GPU failure');
        return {resolution:[canvas.width,canvas.height],actors:rows,tevPrograms:[...programs.values()],eye:Array.from(snapshot.eye),interest:Array.from(snapshot.interest),fov:snapshot.fov,aspect:snapshot.aspect,playable:false,performanceMeasured:false,visualParity:false,limitations:'Diagnostic first-UV shader; original TEV setup is captured but not yet rendered. Original lighting, transparency, material animation, effect rendering, HUD and complete stage callbacks remain incomplete.'};
      },dispose,
    };
  } catch(error){dispose();throw error;}
}
