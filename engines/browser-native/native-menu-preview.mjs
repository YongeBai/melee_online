import {inspectArchive,archiveRootView} from './archive.mjs';
import {readModelMeshes} from './mesh-assets.mjs';
import {createMaterialRenderer} from './material-gpu.mjs';
import {createNativeCamera} from './native-camera.mjs';
import {verifyGpuMaterialShader} from './verify-material-shader.mjs';
export function createNativeMenuPreview(module,canvas,bytes,converted,{verifyVertices=false}={}){
 const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:true,preserveDrawingBuffer:true});if(!gl)throw Error('Native menu requires WebGL2');
 const renderer=createMaterialRenderer(gl,module,{verifyVertices}),camera=createNativeCamera(module,{read:p=>module._portStageMenuCameraSnapshot(p)}),list=module._malloc(128*12),resources=[];
 const archive=inspectArchive(bytes),base=module._portStageMenuRead(4)-converted.rows[8].joint,cache=new Map();
 if(!list||base<0)throw Error('Menu ownership');
 const info=gl.getExtension('WEBGL_debug_renderer_info'),gpu={renderer:gl.getParameter(info?info.UNMASKED_RENDERER_WEBGL:gl.RENDERER),vendor:gl.getParameter(info?info.UNMASKED_VENDOR_WEBGL:gl.VENDOR)};
 const shaderChecks=verifyVertices?verifyGpuMaterialShader(gl,{fog:true}):null;
 try{
  function sync(){
  const count=module._portStageMenuObjects(list,128),objects=Array.from(new Uint32Array(module.HEAPU8.buffer,list,count*3));
  const keys=new Set(Array.from({length:count},(_,i)=>objects.slice(i*3,i*3+3).join(':'))),ordered=[];
  for(let i=resources.length-1;i>=0;i--)if(!keys.has(resources[i].key)){const r=resources[i];r.gpu.dispose();module._free(r.nodes);resources.splice(i,1);}
  for(let i=0;i<count;i++){
   const [owner,root,descriptor]=objects.slice(i*3,i*3+3),offset=descriptor-base,key=[owner,root,descriptor].join(':');
   const previous=resources.find(r=>r.key===key);if(previous){
    // Original hover labels repeatedly destroy/recreate the same model. HSD
    // may reuse both GObj and root addresses while children/PObjs change.
    if(module._portSceneCollect(root,previous.nodes,previous.n)!==previous.n)throw Error('Reused menu hierarchy mismatch');
    previous.gpu.refreshBindings();ordered.push(previous);continue;
   }
   if(!converted.rows.some(r=>r.joint===offset))throw Error('Unknown menu model descriptor '+offset);
   if(!cache.has(offset)){const source=archiveRootView(archive,'menu_Share_joint',offset);cache.set(offset,{source,model:readModelMeshes(source)});}
   const {source,model}=cache.get(offset),n=model.tree.nodes.length,nodes=module._malloc(n*4);if(!nodes)throw Error('Menu nodes allocation');
   let resource={owner,nodes,offset,key,n};resources.push(resource);ordered.push(resource);
   if(module._portSceneCollect(root,nodes,n)!==n)throw Error('Menu hierarchy mismatch');
   resource.gpu=renderer.upload(model,source,nodes,owner);
  }
  return ordered;
  }
  function draw(){
   const ordered=sync();
   const c=camera.snapshot(),d=archive.data,p=converted.camera;
   if(c.fov!==d.getFloat32(p+48)||c.aspect!==d.getFloat32(p+52)||c.near!==d.getFloat32(p+40)||c.far!==d.getFloat32(p+44))throw Error('Menu camera differs from original descriptor');
   renderer.begin(c);
   for(let pass=0;pass<3;pass++){module._portStageMenuRenderBegin();for(const r of ordered)module._portNativeDrawObject(r.owner,pass,1);}
   const result=renderer.flush({ordered:true});
   return {...result,objects:ordered.length,gpu,shaderChecks,camera:{eye:[...c.eye],interest:[...c.interest],fov:c.fov,aspect:c.aspect,near:c.near,far:c.far}};
  }
  return {draw,dispose};
 }catch(e){dispose();throw e;}
 function dispose(){for(const r of resources){r.gpu?.dispose();module._free(r.nodes);}if(list)module._free(list);camera.dispose();renderer.dispose();}
}
