import {inspectArchive,archiveRootView} from './archive.mjs';
import {readModelMeshes} from './mesh-assets.mjs';
import {createMaterialRenderer} from './material-gpu.mjs';
import {createNativeCamera} from './native-camera.mjs';

export function createNativeResultScenePreview(module,canvas,bytes,converted){
 const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:true,preserveDrawingBuffer:true});if(!gl)throw Error('Native results require WebGL2');
 const renderer=createMaterialRenderer(gl,module,{traceTextures:true}),camera=createNativeCamera(module,{read:p=>module._portResultSceneCameraSnapshot(p)}),list=module._malloc(12),owners=module._malloc(8*4),archive=inspectArchive(bytes),resources=[];
 if(!list||!owners)throw Error('Result scene allocation');let base;
 function sync(){
  const count=module._portResultSceneObjects(list,1),words=Array.from(new Uint32Array(module.HEAPU8.buffer,list,count*3));if(count!==1)throw Error('Unexpected result scene object count');
  const [owner,root,descriptor]=words;if(base===undefined)base=descriptor-converted.scenes[0].rows[0].joint;const offset=descriptor-base;
  if(offset!==converted.scenes[0].rows[0].joint)throw Error('Unexpected result panel descriptor');let resource=resources[0];
  if(!resource){const source=archiveRootView(archive,'result_Share_joint',offset),model=readModelMeshes(source),n=model.tree.nodes.length,nodes=module._malloc(n*4);if(!nodes)throw Error('Result scene nodes allocation');
   resource={owner,root,nodes,n,source,model};resources.push(resource);if(module._portSceneCollect(root,nodes,n)!==n)throw Error('Result scene hierarchy mismatch');resource.gpu=renderer.upload(model,source,nodes,owner);
  }else{if(resource.owner!==owner||resource.root!==root||module._portSceneCollect(root,resource.nodes,resource.n)!==resource.n)throw Error('Result scene identity changed');resource.gpu.refreshBindings();}
  return resource;
 }
 function draw(){const resource=sync(),c=camera.snapshot(),d=archive.data,p=converted.scenes[0].camera;
  if(c.fov!==d.getFloat32(p+48)||c.aspect!==d.getFloat32(p+52)||c.near!==d.getFloat32(p+40)||c.far!==d.getFloat32(p+44))throw Error('Result camera differs from original descriptor');
  const textCount=module._portResultSceneTextOwners(owners,8),textOwners=Array.from(new Uint32Array(module.HEAPU8.buffer,owners,textCount));
  renderer.begin(c);for(let pass=0;pass<3;pass++){module._portResultSceneRenderBegin();module._portNativeDrawObject(resource.owner,pass,1);for(const owner of textOwners)module._portNativeDrawText(owner,pass);}const result=renderer.flush({ordered:true});
  return {...result,objects:1,nodes:resource.n,meshes:resource.model.meshes.length,camera:{eye:[...c.eye],interest:[...c.interest],fov:c.fov,aspect:c.aspect,near:c.near,far:c.far}};
 }
 function dispose(){for(const resource of resources){resource.gpu.dispose();module._free(resource.nodes);}module._free(owners);module._free(list);camera.dispose();renderer.dispose();}
 return {draw,dispose};
}
