import {verifyGpuMaterialShader} from './verify-material-shader.mjs';
import {createMaterialRenderer} from './material-gpu.mjs';
import {readModelMeshes} from './mesh-assets.mjs';
import {readModelMaterials} from './material-assets.mjs';
import {inspectArchive} from './archive.mjs';
import {readSkinBindings,loadSkin} from './skin-assets.mjs';
import {textureMatrices} from './texture-matrix.mjs';
import {createMeshPipeline,uploadMesh} from './gpu-mesh.mjs';
import {createNativeCamera,checkNativeCamera} from './native-camera.mjs';
import {readNativeTev} from './native-tev.mjs';
import {readNativeTextures,decodeNativeTexture} from './native-texture.mjs';
import {readNativeRenderContext,checkNativeRenderContext} from './native-render-context.mjs';
import {readNativePixel} from './native-pixel.mjs';
import {createNativeModelProbe} from './verify-model-state.mjs';

// Inspection bridge, not the gameplay renderer: native live poses, visibility
// and camera. The native-material path is still missing full draw callbacks.
export function createNativeMatchPreview(module,canvas,actors,{materials=true}={}) {
  const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:true,preserveDrawingBuffer:true});
  if(!gl)throw Error('Native preview needs WebGL2');
  const camera=createNativeCamera(module),pipeline=createMeshPipeline(gl),materialRenderer=materials?createMaterialRenderer(gl,module,{verifyVertices:true}):null,resources=[];
  function dispose(){for(const r of resources){r.modelProbe.dispose();r.gpu.dispose();r.skin.dispose();for(const p of r.allocations)module._free(p);}materialRenderer?.dispose();pipeline.dispose();camera.dispose();}
  let materialShaderChecks;
  try {
    materialShaderChecks=materials?verifyGpuMaterialShader(gl):null;
    for(const actor of actors) {
      const model=readModelMeshes(actor.bytes);if(!model.meshes.length)continue;
      const archive=inspectArchive(actor.bytes),d=archive.data,extra=actor.extraRoot??0,n=model.tree.nodes.length;
      const allocations=[],alloc=size=>{const p=module._malloc(size);if(!p)throw Error('Preview allocation');allocations.push(p);return p;};
      let skin,gpu,modelProbe,materialGpu;
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
        modelProbe=createNativeModelProbe(module,model,actor.bytes,nodes,skin,actor.object);
        materialGpu=materialRenderer?.upload(model,actor.bytes,nodes,actor.object);
        resources.push({materialGpu,name:actor.name,owner:actor.object,prepare:actor.prepare,finish:actor.finish,model,skin,gpu,modelProbe,nodes,flags,indices,visible,allocations});
      } catch(error){materialGpu?.dispose();modelProbe?.dispose();gpu?.dispose();skin?.dispose();for(const p of allocations)module._free(p);throw error;}
    }
    return {
      draw(){
        const snapshot=camera.snapshot();checkNativeCamera(snapshot);
        module._portStageRenderBegin();
        materialRenderer?.begin(snapshot);
        const renderContext=readNativeRenderContext(module);checkNativeRenderContext(renderContext,snapshot);
        gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
        const rows=[],programs=new Map(),pixelStates=new Map(),lightStates=new Map();
        for(const r of resources) {
          const {model,skin,gpu,nodes,flags,indices,visible}=r;
          const show=r.prepare?r.prepare():true;
          module._portSceneMatrices(model.tree.nodes.length,nodes,skin.world);
          module._portSceneFlags(model.tree.nodes.length,nodes,flags);
          module._portSceneMeshVisibility(model.meshes.length,nodes,indices,visible);
          const seen=new Set(),texgenTypes=new Set();let textureBindings=0;
          for(let i=0;i<model.meshes.length;i++) {
            const mesh=model.meshes[i];if(seen.has(mesh.dobj))continue;seen.add(mesh.dobj);
            const specs=new Uint16Array(module.HEAPU8.buffer,indices,model.meshes.length*2);
            const joint=new Uint32Array(module.HEAPU8.buffer,nodes,model.tree.nodes.length)[specs[i*2]];
            const program=readNativeTev(module,joint,specs[i*2+1],r.owner),key=JSON.stringify(program.stages);
            if(!programs.has(key))programs.set(key,{program,materials:0});programs.get(key).materials++;
            const textures=readNativeTextures(module);textureBindings+=textures.textures.length;
            const pixel=readNativePixel(module),pixelKey=JSON.stringify(pixel);
            const context=readNativeRenderContext(module);checkNativeRenderContext(context,snapshot,pixel);
            lightStates.set(JSON.stringify(context.lights),context.lights);
            if(!pixelStates.has(pixelKey))pixelStates.set(pixelKey,{state:pixel,materials:0});pixelStates.get(pixelKey).materials++;
            for(const t of textures.textures)decodeNativeTexture(module,t);
            for(const g of textures.generators)texgenTypes.add(g.type+'/'+g.source+'/'+g.normalize);
          }
          skin.step();gpu.updatePalette(module.HEAPF32.subarray(skin.matrices/4,skin.matrices/4+skin.groupCount*12));
          const modelMatrixChecks=r.modelProbe.check(snapshot.raw.subarray(0,12));
          const jointFlags=new Uint32Array(module.HEAPU8.buffer,flags,model.tree.nodes.length),visibility=new Uint32Array(module.HEAPU8.buffer,visible,model.meshes.length);
          const draws=r.materialGpu?r.materialGpu.enqueue(jointFlags,visibility,show):show?gpu.draw(snapshot.view,snapshot.projection,jointFlags,visibility):0;
          if(r.prepare&&!draws)throw Error('Native fighter preview has no visible body meshes');
          const positions=gpu.readPositions(),reference=module.HEAPF32.subarray(skin.transformed/4,skin.transformed/4+positions.length);
          let maxScaledVertexError=0;
          for(let i=0;i<positions.length;i++) {
            const error=Math.abs(positions[i]-reference[i])/(1+Math.abs(reference[i]));
            if(!Number.isFinite(error)||error>0.00002)throw Error('Live native/GPU vertex mismatch');
            maxScaledVertexError=Math.max(maxScaledVertexError,error);
          }
          if(show)r.finish?.();
          rows.push({name:r.name,joints:model.tree.nodes.length,meshes:model.meshes.length,draws,vertices:positions.length/3,maxScaledVertexError,textureBindings,texgenTypes:[...texgenTypes],modelMatrixChecks});
        }
        const materialDraws=materialRenderer?.flush();
        if(gl.getError()!==gl.NO_ERROR)throw Error('Native match preview GPU failure');
        return {materialShaderChecks,materialDraws,resolution:[canvas.width,canvas.height],actors:rows,tevPrograms:[...programs.values()],pixelStates:[...pixelStates.values()],renderContext,lightStates:[...lightStates.values()],eye:Array.from(snapshot.eye),interest:Array.from(snapshot.interest),fov:snapshot.fov,aspect:snapshot.aspect,playable:false,performanceMeasured:false,visualParity:false,limitations:materials?'Native material draw integration; complete draw callbacks/pass sorting, image invalidation, exact texture filtering, effects, HUD and stage callbacks remain incomplete.':'Diagnostic first-UV shader; native material state is captured but not rendered.'};
      },dispose,
    };
  } catch(error){dispose();throw error;}
}
