import {inspectArchive,archiveRootView} from './archive.mjs';
import {readModelMeshes} from './mesh-assets.mjs';
import {createMaterialRenderer} from './material-gpu.mjs';
import {createNativeCamera} from './native-camera.mjs';
// Consume the original CSS camera mask, GX links and callbacks. SIS participates
// in the same ordered stream as models so hands retain their native layering.
export function createNativeCharacterMenuPreview(module,canvas,bytes,converted,{verifyVertices=false}={}){
 const gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:false,antialias:false,depth:true,preserveDrawingBuffer:true});if(!gl)throw Error('Native menu requires WebGL2');
 const renderer=createMaterialRenderer(gl,module,{verifyVertices}),camera=createNativeCamera(module,{read:p=>module._portCharacterMenuCameraSnapshot(p)}),list=module._malloc(256*16),resources=[],cache=new Map();
 const archive=inspectArchive(bytes);let base;
 const info=gl.getExtension('WEBGL_debug_renderer_info'),gpu={renderer:gl.getParameter(info?info.UNMASKED_RENDERER_WEBGL:gl.RENDERER),vendor:gl.getParameter(info?info.UNMASKED_VENDOR_WEBGL:gl.VENDOR)};
 if(!list)throw Error('Menu allocation');
 function sync(){
  const count=module._portCharacterMenuObjects(list,256),objects=Array.from(new Uint32Array(module.HEAPU8.buffer,list,count*4));
  if(base===undefined){if(objects[3])throw Error('Missing original CSS background');base=objects[2]-converted.rows[0].joint;}
  const keys=new Set(Array.from({length:count},(_,i)=>objects.slice(i*4,i*4+3).join(':'))),ordered=[];
  for(let i=resources.length-1;i>=0;i--)if(!keys.has(resources[i].key)){const r=resources[i];r.gpu.dispose();module._free(r.nodes);resources.splice(i,1);}
  for(let i=0;i<count;i++){
   const [owner,root,descriptor,text]=objects.slice(i*4,i*4+4);if(text){ordered.push({owner,text:true});continue;}
   const offset=descriptor-base,key=[owner,root,descriptor].join(':');let r=resources.find(r=>r.key===key);
   if(r){if(module._portSceneCollect(root,r.nodes,r.n)!==r.n)throw Error('Reused CSS hierarchy mismatch');r.gpu.refreshBindings();ordered.push(r);continue;}
   if(!converted.rows.some(r=>r.joint===offset))throw Error('Unknown CSS model descriptor '+offset);
   if(!cache.has(offset)){const source=archiveRootView(archive,'menu_Share_joint',offset);cache.set(offset,{source,model:readModelMeshes(source)});}
   const {source,model}=cache.get(offset),n=model.tree.nodes.length,nodes=module._malloc(n*4);if(!nodes)throw Error('CSS node allocation');
   r={owner,nodes,n,offset,key};resources.push(r);ordered.push(r);
   if(module._portSceneCollect(root,nodes,n)!==n)throw Error('CSS hierarchy mismatch');r.gpu=renderer.upload(model,source,nodes,owner);
  }
  return ordered;
 }
 function draw(){
  const ordered=sync(),c=camera.snapshot(),d=archive.data,p=converted.camera;
  if(c.fov!==d.getFloat32(p+48)||c.aspect!==d.getFloat32(p+52)||c.near!==d.getFloat32(p+40)||c.far!==d.getFloat32(p+44))throw Error('CSS camera differs from original descriptor');
  const product=module._portMenuProduct(),human=[0,1].map(i=>!product||module._portCharacterMenuRead(3,i)===0);
  const hiddenHands=new Set(product?[0,1].filter(i=>!human[i]).map(i=>module._portCharacterMenuHand(i)):[]);
  renderer.begin(c);
  for(let pass=0;pass<3;pass++){module._portCharacterMenuRenderBegin();for(const r of ordered){if(r.text)module._portNativeDrawText(r.owner,pass);else if(!hiddenHands.has(r.owner))module._portNativeDrawObject(r.owner,pass,1);}}
  const result=renderer.flush({ordered:true});
  if(product){
   const mul=(m,v)=>[0,1,2,3].map(r=>v.reduce((n,x,k)=>n+m[k*4+r]*x,0));
   const project=(x,y)=>{const v=mul(c.projection,mul(c.view,[x,y,0,1]));return [(v[0]/v[3]+1)/2,(1-v[1]/v[3])/2];};
   const regions=[[-14.91,-2.32,29.82,-22.61],[-20.04,-21.22,2.98,-2.61],[24.71,-21.22,2.98,-2.61]].map(([x,y,w,h])=>{const a=project(x,y),b=project(x+w,y+h);return {left:a[0],top:a[1],width:b[0]-a[0],height:b[1]-a[1]};});
   for(const [index,rect] of regions.entries()){
    // Leave the original CPU card opaque; there is no keyboard control below it.
    if(index&&!human[index-1])continue;
    renderer.begin(c);
    for(let pass=0;pass<3;pass++){module._portCharacterMenuRenderBegin();for(let i=0;i<2;i++)if(human[i])module._portNativeDrawObject(module._portCharacterMenuHand(i),pass,1);}
    renderer.flush({ordered:true,clearAlpha:0,forceAlpha:true,clip:[Math.round(rect.left*canvas.width),Math.round((1-rect.top-rect.height)*canvas.height),Math.round(rect.width*canvas.width),Math.round(rect.height*canvas.height)]});
   }
   gl.disable(gl.SCISSOR_TEST);globalThis.nativeMenuApertures=regions;globalThis.nativeMenuHandPoint=(x,y)=>project(x+5,y-.75);canvas.style.visibility="visible";
  }
  return {...result,objects:ordered.length,textObjects:ordered.filter(r=>r.text).length,gpu,camera:{eye:[...c.eye],interest:[...c.interest],fov:c.fov,aspect:c.aspect,near:c.near,far:c.far}};
 }
 function dispose(){for(const r of resources){r.gpu?.dispose();module._free(r.nodes);}module._free(list);camera.dispose();renderer.dispose();}
 return {draw,dispose};
}
