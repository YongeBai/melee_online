import {verifyGpuMaterialShader} from './verify-material-shader.mjs';
import {createMaterialRenderer} from './material-gpu.mjs';
import {createModelGeometryCache} from './model-geometry-cache.mjs';
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
// and camera. Full scene startup and teardown remain development work.
export function createNativeMatchPreview(module,canvas,actors,{materials=true,verify=true,callbacks=true,hud=null,stage=null,effects=null,items=null,cameraValidation={},cameraRead=null,renderBegin=null,nativeViewport=false,transparent=false,gpuErrorChecks=true,traceAttachments=false,cacheModels=true,presentationCache=null}={}) {
  if(stage&&!callbacks)throw Error('Stage callbacks require original camera passes');
  const gl=canvas.getContext('webgl2',{alpha:transparent,premultipliedAlpha:!transparent,antialias:false,depth:true,preserveDrawingBuffer:verify});
  if(!gl)throw Error('Native preview needs WebGL2');
  const readGpuInfo=()=>{const info=gl.getExtension('WEBGL_debug_renderer_info');return {renderer:gl.getParameter(info?info.UNMASKED_RENDERER_WEBGL:gl.RENDERER),vendor:gl.getParameter(info?info.UNMASKED_VENDOR_WEBGL:gl.VENDOR),version:gl.getParameter(gl.VERSION)};};
  const gpuInfo=presentationCache?presentationCache.gpuInfo(gl,readGpuInfo):readGpuInfo();
  const geometry=presentationCache?.geometry??createModelGeometryCache({enabled:cacheModels});
  const camera=createNativeCamera(module,cameraRead?{read:cameraRead}:undefined),beginRender=renderBegin??(()=>module._portStageRenderBegin()),pipeline=verify||!materials?createMeshPipeline(gl):null,materialRenderer=materials?createMaterialRenderer(gl,module,{verifyVertices:verify,checkErrors:verify||gpuErrorChecks,presentationCache}):null,resources=[];
  const hudCamera=hud?createNativeCamera(module,{read:p=>module._portHudCameraSnapshot(p)}):null,hudResources=new Map(),hudList=hud?module._malloc(32*12):0;
  if(hud&&(!hudList||!callbacks))throw Error('HUD requires original callbacks and object buffer');
  function releaseResource(r){for(const a of r.accessories){a.accessoryGpu?.dispose();if(a.accessoryNodes)module._free(a.accessoryNodes);}r.materialGpu?.dispose();r.modelProbe?.dispose();r.gpu?.dispose();r.skin?.dispose();for(const p of r.allocations)module._free(p);}
  function dispose(){if(!presentationCache)geometry.clear();delete module.onNativeObject;if(itemList)module._free(itemList);if(effectList)module._free(effectList);for(const r of hudResources.values()){r.gpu.dispose();module._free(r.nodes);}if(hudList)module._free(hudList);hudCamera?.dispose();for(const r of resources)releaseResource(r);materialRenderer?.dispose();pipeline?.dispose();camera.dispose();}
  function drawHud(){
    if(!hud)return null;
    const count=module._portHudObjects(hudList,32),objects=Array.from(new Uint32Array(module.HEAPU8.buffer,hudList,count*3)),active=new Set();
    for(let i=0;i<count;i++)active.add(objects[i*3]+':'+objects[i*3+1]+':'+objects[i*3+2]);
    for(const [key,r] of hudResources)if(!active.has(key)){r.gpu.dispose();module._free(r.nodes);hudResources.delete(key);}
    const rows=[];
    for(let i=0;i<count;i++){
      const [owner,root,descriptor]=objects.slice(i*3,i*3+3),key=owner+':'+root+':'+descriptor;
      if(!hudResources.has(key)){
        const source=hud.models.get(descriptor);if(!source)throw Error('Unregistered original HUD model '+descriptor);
        const model=geometry.read(source.bytes),n=model.tree.nodes.length,nodes=module._malloc(n*4);
        if(!nodes)throw Error('HUD nodes allocation');
        try{if(module._portSceneCollect(root,nodes,n)!==n)throw Error('HUD hierarchy mismatch');const gpu=materialRenderer.upload(model,source.bytes,nodes,owner);hudResources.set(key,{gpu,nodes,n,name:source.name});}catch(error){module._free(nodes);throw error;}
      }else{
        const r=hudResources.get(key);if(module._portSceneCollect(root,r.nodes,r.n)!==r.n)throw Error('Reused HUD hierarchy mismatch');r.gpu.refreshBindings();
      }
      rows.push({owner,name:hudResources.get(key).name,draws:0});
    }
    const snapshot=hudCamera.snapshot();checkNativeCamera(snapshot,{hud:true});materialRenderer.selectCamera(snapshot);
    for(let pass=0;pass<3;pass++){module._portHudRenderBegin();for(const row of rows)row.draws+=module._portNativeDrawObject(row.owner,pass,1);}
    return {objects:rows,eye:Array.from(snapshot.eye),interest:Array.from(snapshot.interest),fov:snapshot.fov,aspect:snapshot.aspect};
  }
  function syncAccessories(){
    let count=0;
    for(const owner of resources)for(const r of owner.accessories){
      const root=r.accessory.root(),kind=root?(r.accessory.kind?.()??1):0;
      if(root!==(r.accessoryRoot??0)||kind!==(r.accessoryKind??0)){
        r.accessoryGpu?.dispose();r.accessoryGpu=null;
        if(r.accessoryNodes)module._free(r.accessoryNodes);r.accessoryNodes=0;r.accessoryRoot=root;r.accessoryKind=kind;
        if(root){
          const bytes=r.accessory.models?r.accessory.models.get(kind):r.accessory.bytes;
          if(!bytes)throw Error('Unregistered fighter accessory '+kind);
          const model=geometry.read(bytes),n=model.tree.nodes.length;
          r.accessoryNodes=module._malloc(n*4);if(!r.accessoryNodes)throw Error('Accessory node allocation');
          const count=r.accessory.collectNodes?r.accessory.collectNodes(r.accessoryNodes,n):module._portSceneCollect(root,r.accessoryNodes,n);
          if(count!==n)throw Error('Accessory hierarchy mismatch');
          r.accessoryGpu=materialRenderer.upload(model,bytes,r.accessoryNodes,owner.owner,{descriptorBase:r.accessory.descriptorBase??null});
        }
      }
      if(root)count++;
    }
    return count;
  }
  function addActor(actor) {
      const model=geometry.read(actor.bytes);if(!model.meshes.length)return;
      const archive=presentationCache?presentationCache.archive(actor.bytes):inspectArchive(actor.bytes),d=archive.data,extra=actor.extraRoot??0,n=model.tree.nodes.length;
      const allocations=[],alloc=size=>{const p=module._malloc(size);if(!p)throw Error('Preview allocation');allocations.push(p);return p;};
      let skin,gpu,modelProbe,materialGpu;
      try {
        const collected=alloc((n+extra)*4),nodes=collected+extra*4,flags=alloc(n*4),indices=alloc(model.meshes.length*4),visible=alloc(model.meshes.length*4);
        if(actor.collectNodes){if(extra)throw Error('Explicit actor nodes with extra root');actor.collectNodes(nodes,model.tree.nodes);}
        else if(module._portSceneCollect(actor.root??module._portSceneObjectRoot(actor.object),collected,n+extra)!==n+extra)throw Error('Live preview hierarchy mismatch');
        module.__dirtyMark?.(indices,model.meshes.length*4);const specs=new Uint16Array(module.HEAPU8.buffer,indices,model.meshes.length*2);
        model.meshes.forEach((mesh,i)=>{
          let at=model.tree.nodes[mesh.joint].display,index=0;
          while(at!==mesh.dobj){if(at===null||index++>=4096)throw Error('Preview DObj ownership');at=archive.relocations.has(at+4)?d.getUint32(at+4):null;}
          specs[i*2]=mesh.joint;specs[i*2+1]=index;
        });
        if(verify||!materials) {
        const assets=readModelMaterials(actor.bytes,model);
        skin=loadSkin(module,model,readSkinBindings(actor.bytes,model),{referenceVertices:true});
        gpu=uploadMesh(gl,pipeline,model,skin,assets,textureMatrices(module,assets.textures));
        modelProbe=createNativeModelProbe(module,model,actor.bytes,nodes,skin,actor.object);
        }
        materialGpu=materialRenderer?.upload(model,actor.bytes,nodes,actor.object);
        resources.push({itemAttachment:!!(actor.itemKey&&actor.root),itemKey:actor.itemKey,stageKey:actor.stageKey,effectKey:actor.effectKey,materialGpu,accessories:[actor.accessory,...(actor.accessories??[])].filter(Boolean).map(accessory=>({accessory})),name:actor.name,active:actor.active,owner:actor.object,nativeDraw:actor.nativeDraw,prepare:actor.prepare,finish:actor.finish,model,skin,gpu,modelProbe,nodes,flags,indices,visible,allocations});
      } catch(error){materialGpu?.dispose();modelProbe?.dispose();gpu?.dispose();skin?.dispose();for(const p of allocations)module._free(p);throw error;}
    }
  let stageOwners=new Set(),effectOwners=new Set(),itemOwners=new Set();
  const immediateStats={primitives:0,submittedDraws:0,vertices:0,frames:0},particleStats={draws:0,vertices:0,frames:0,peakDraws:0},afterimageStats={draws:0,vertices:0,frames:0,peakDraws:0};
  const resourceStats={stageCreated:0,stageRetired:0,effectCreated:0,effectRetired:0,peakEffectModels:0,itemCreated:0,itemRetired:0,peakItemModels:0};
  const itemList=items?module._malloc(1024*12):0;
  if(items&&!itemList)throw Error('Item owner allocation');
  function syncItems(){
    if(!items)return;
    const count=module._portItemsList(itemList,512);if(count>512)throw Error('Item renderer capacity');
    const current=Array.from(new Uint32Array(module.HEAPU8.buffer,itemList,count),object=>{
      const descriptor=module._portItemRead(object,8);
      // Item_802680CC creates an empty JObj when the Article has no model.
      // Thunder Jolt's controller remains simulated while its separate child
      // supplies the visible geometry; it needs no GPU model resource.
      if(!descriptor)return null;
      const source=items.get(descriptor);
      if(!source)throw Error('Unregistered item model descriptor '+descriptor);
      return {...source,object,itemKey:object+':'+module._portSceneObjectRoot(object)+':'+descriptor};
    }).filter(Boolean);
    itemOwners=new Set(new Uint32Array(module.HEAPU8.buffer,itemList,count));
    const links=module._portItemLinksList(itemList,1024);if(links>1024)throw Error('Linked item renderer capacity');
    const linked=Array.from(new Uint32Array(module.HEAPU8.buffer,itemList,links*2));
    for(let i=0;i<links;i++){
      const [object,descriptor]=linked.slice(i*2,i*2+2),source=items.get(descriptor);
      if(!source)throw Error('Unregistered linked item descriptor '+descriptor);
      current.push({...source,object,itemKey:object+':'+module._portSceneObjectRoot(object)+':'+descriptor});itemOwners.add(object);
    }
    const attachments=module._portItemAttachmentsList(itemList,1024);if(attachments>1024)throw Error('Item attachment renderer capacity');
    const attached=Array.from(new Uint32Array(module.HEAPU8.buffer,itemList,attachments*3));
    for(let i=0;i<attachments;i++){
      const [object,root,descriptor]=attached.slice(i*3,i*3+3),source=items.get(descriptor);
      if(!source)throw Error('Unregistered item attachment descriptor '+descriptor);
      current.push({...source,object,root,itemKey:object+':'+root+':'+descriptor});
    }
    const keys=new Set(current.map(a=>a.itemKey));
    for(let i=resources.length-1;i>=0;i--)if(resources[i].itemKey&&!keys.has(resources[i].itemKey)){releaseResource(resources[i]);resources.splice(i,1);resourceStats.itemRetired++;}
    resourceStats.peakItemModels=Math.max(resourceStats.peakItemModels,current.length);
    for(const actor of current){
      const old=resources.find(r=>r.itemKey===actor.itemKey);
      if(!old){addActor(actor);if(resources.some(r=>r.itemKey===actor.itemKey))resourceStats.itemCreated++;}
      else {if(module._portSceneCollect(actor.root??module._portSceneObjectRoot(actor.object),old.nodes,old.model.tree.nodes.length)!==old.model.tree.nodes.length)throw Error('Reused item hierarchy mismatch');old.materialGpu.refreshBindings();}
    }
  }
  const effectList=effects?module._malloc(512*12):0;
  if(effects&&!effectList)throw Error('Effect owner allocation');
  function syncEffects(){
    if(!effects)return;
    const count=module._portEffectModels(effectList,512),list=Array.from(new Uint32Array(module.HEAPU8.buffer,effectList,count*3)),current=[];
    effectOwners=new Set();
    for(let i=0;i<count;i++){
      const [object,root,descriptor]=list.slice(i*3,i*3+3),source=effects.get(descriptor);
      if(!source)throw Error('Unregistered effect model descriptor '+descriptor);
      effectOwners.add(object);current.push({...source,object,effectKey:object+':'+root+':'+descriptor});
    }
    const keys=new Set(current.map(a=>a.effectKey));
    for(let i=resources.length-1;i>=0;i--)if(resources[i].effectKey&&!keys.has(resources[i].effectKey)){releaseResource(resources[i]);resources.splice(i,1);resourceStats.effectRetired++;}
    resourceStats.peakEffectModels=Math.max(resourceStats.peakEffectModels,current.length);
    for(const actor of current){
      const old=resources.find(r=>r.effectKey===actor.effectKey);
      if(!old){addActor(actor);if(resources.some(r=>r.effectKey===actor.effectKey))resourceStats.effectCreated++;}
      else {if(module._portSceneCollect(module._portSceneObjectRoot(actor.object),old.nodes,old.model.tree.nodes.length)!==old.model.tree.nodes.length)throw Error('Reused effect hierarchy mismatch');old.materialGpu.refreshBindings();}
    }
  }
  let cosmeticStageOwners=new Set();
  function syncStage(){
    if(!stage)return;
    const current=stage().map(a=>({...a,stageKey:a.name+':'+a.object+':'+module._portSceneObjectRoot(a.object)})),keys=new Set(current.map(a=>a.stageKey));
    stageOwners=new Set(current.map(a=>a.object));cosmeticStageOwners=new Set(current.filter(a=>a.cosmeticHidden).map(a=>a.object));
    for(let i=resources.length-1;i>=0;i--)if(resources[i].stageKey&&!keys.has(resources[i].stageKey)){releaseResource(resources[i]);resources.splice(i,1);resourceStats.stageRetired++;}
    for(const actor of current)if(!actor.emptyStageObject&&!actor.cosmeticHidden&&!resources.some(r=>r.stageKey===actor.stageKey)){addActor(actor);if(resources.some(r=>r.stageKey===actor.stageKey))resourceStats.stageCreated++;}
  }
  let materialShaderChecks;
  try {
    materialShaderChecks=materials&&verify?verifyGpuMaterialShader(gl):null;
    for(const actor of actors)addActor(actor);
    return {
      validateGpu(){if(gl.getError()!==gl.NO_ERROR)throw Error('Native GPU error at probe completion');return true;},
      prewarm(sources){if(!materialRenderer)throw Error('Shader preparation requires material renderer');return materialRenderer.prewarm(sources);},
      shaderSources(){return materialRenderer?.shaderSources()??[];},
      shaderCoverage(){return materialRenderer?.shaderCoverage()??null;},
      resetImmediateStats(){for(const stats of [particleStats,afterimageStats,immediateStats])for(const key of Object.keys(stats))stats[key]=0;},
      draw(){
        if(callbacks){
          if(!materialRenderer)throw Error('Original callbacks require native materials');
          syncStage();syncEffects();syncItems();const accessories=syncAccessories();
          const snapshot=camera.snapshot();checkNativeCamera(snapshot,cameraValidation);materialRenderer.begin(snapshot);
          const rows=resources.map(r=>({name:r.name,active:r.active?.()??true,passes:[],draws:0}));
          let particlePasses=0;
          if(stage){
            module._portStageRenderBegin();
            module.onNativeObject=(owner,pass,link,classifier,particles)=>{
              // Execute the original particle callback in the original camera pass.
              // Unsupported primitives and unknown models still fail explicitly.
              if(cosmeticStageOwners.has(owner))return;
              if(particles){module._portNativeDrawParticles(owner,pass);particlePasses++;return;}
              const i=resources.findIndex(r=>r.owner===owner),r=resources[i];
              if(!r&&!stageOwners.has(owner)&&!effectOwners.has(owner)&&!itemOwners.has(owner))throw Error('Unregistered native render object '+owner+' link '+link+' class '+classifier);
              const count=r?.nativeDraw?r.nativeDraw(pass):r?.prepare?module._portFighterNativeDraw(owner,pass):module._portNativeDrawObject(owner,pass,1);
              if(r){rows[i].passes.push(count);rows[i].draws+=count;}
            };
            try{module._portStageDrawPasses();}finally{delete module.onNativeObject;}
          }else{
          for(let pass=0;pass<3;pass++){
            beginRender();
            const drawnOwners=new Set();
            for(const [i,r] of resources.entries()){
              if(drawnOwners.has(r.owner))continue;drawnOwners.add(r.owner);
              const count=r.nativeDraw?r.nativeDraw(pass):r.prepare?module._portFighterNativeDraw(r.owner,pass):module._portNativeDrawObject(r.owner,pass,0);
              rows[i].passes.push(count);rows[i].draws+=count;
            }
          }
          }
          const renderContext=readNativeRenderContext(module),hudDraws=drawHud(),scaleX=canvas.width/640,scaleY=canvas.height/480,presentation=nativeViewport?{viewport:[Math.round(renderContext.viewport[0]*scaleX),Math.round((480-renderContext.viewport[1]-renderContext.viewport[3])*scaleY),Math.round(renderContext.viewport[2]*scaleX),Math.round(renderContext.viewport[3]*scaleY)],clip:[Math.round(renderContext.scissor[0]*scaleX),Math.round((480-renderContext.scissor[1]-renderContext.scissor[3])*scaleY),Math.round(renderContext.scissor[2]*scaleX),Math.round(renderContext.scissor[3]*scaleY)]}:{},materialDraws=materialRenderer.flush({ordered:true,clearAlpha:transparent?0:1,...presentation});
          const accessoryDraws=traceAttachments?resources.flatMap(r=>r.accessories.filter(a=>a.accessoryGpu).map(a=>({name:a.accessory.name??null,draws:a.accessoryGpu.queuedDrawCount()}))):null;
          const attachmentDraws=traceAttachments?resources.filter(r=>r.itemAttachment).map(r=>({name:r.name,draws:r.materialGpu.queuedDrawCount()})):null;
          for(const [stats,draws,vertices] of [[particleStats,materialDraws.particleDraws,materialDraws.particleVertices],[afterimageStats,materialDraws.afterimageDraws,materialDraws.afterimageVertices]]){
            stats.draws+=draws;stats.vertices+=vertices;if(draws)stats.frames++;stats.peakDraws=Math.max(stats.peakDraws,draws);
          }
          immediateStats.primitives+=materialDraws.particleDraws+materialDraws.afterimageDraws;immediateStats.submittedDraws+=materialDraws.immediateDraws;immediateStats.vertices+=materialDraws.immediateVertices;immediateStats.frames++;
          if(!verify)gl.flush();
          return {gpuInfo,materialShaderChecks,materialDraws,accessories,particlePasses,attachmentDraws,accessoryDraws,immediateStats:{...immediateStats},particleStats:{...particleStats},afterimageStats:{...afterimageStats},originalCameraPasses:!!stage,resourceStats:{...resourceStats},modelCache:geometry.stats,effectModels:resources.filter(r=>r.effectKey).length,hud:hudDraws,resolution:[canvas.width,canvas.height],actors:rows,...(verify?materialRenderer.inspect():{}),renderContext,eye:Array.from(snapshot.eye),interest:Array.from(snapshot.interest),fov:snapshot.fov,aspect:snapshot.aspect,near:snapshot.near,far:snapshot.far,originalObjectCallbacks:true,playable:false,performanceMeasured:false,visualParity:false,limitations:stage?'Original camera passes, dynamic models and original particle polygons; point/line particles, shadow capture, refraction, other accessories and complete scene lifecycle remain.':'Original fighter callbacks, joint traversal and respawn platforms; complete camera/GX-link stage ordering, other accessories/effects and full match lifecycle remain.'};
        }
        const snapshot=camera.snapshot();checkNativeCamera(snapshot,cameraValidation);
        beginRender();
        materialRenderer?.begin(snapshot);
        const renderContext=readNativeRenderContext(module);checkNativeRenderContext(renderContext,snapshot);
        gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,transparent?0:1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
        const rows=[],programs=new Map(),pixelStates=new Map(),lightStates=new Map();
        for(const r of resources) {
          const {model,skin,gpu,nodes,flags,indices,visible}=r;
          const show=r.prepare?r.prepare():true;
          if(verify||!materials)module._portSceneMatrices(model.tree.nodes.length,nodes,skin.world);
          module._portSceneFlags(model.tree.nodes.length,nodes,flags);
          module._portSceneMeshVisibility(model.meshes.length,nodes,indices,visible);
          const seen=new Set(),texgenTypes=new Set();let textureBindings=0;
          if(verify)for(let i=0;i<model.meshes.length;i++) {
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
          if(verify||!materials){skin.step();gpu.updatePalette(module.HEAPF32.subarray(skin.matrices/4,skin.matrices/4+skin.groupCount*12));}
          const modelMatrixChecks=verify?r.modelProbe.check(snapshot.raw.subarray(0,12)):null;
          const jointFlags=new Uint32Array(module.HEAPU8.buffer,flags,model.tree.nodes.length),visibility=new Uint32Array(module.HEAPU8.buffer,visible,model.meshes.length);
          const draws=r.materialGpu?r.materialGpu.enqueue(jointFlags,visibility,show):show?gpu.draw(snapshot.view,snapshot.projection,jointFlags,visibility):0;
          if(show&&r.prepare&&!draws)throw Error('Native fighter preview has no visible body meshes');
          const positions=verify?gpu.readPositions():[],reference=verify?module.HEAPF32.subarray(skin.transformed/4,skin.transformed/4+positions.length):[];
          let maxScaledVertexError=0;
          for(let i=0;i<positions.length;i++) {
            const error=Math.abs(positions[i]-reference[i])/(1+Math.abs(reference[i]));
            if(!Number.isFinite(error)||error>0.00002)throw Error('Live native/GPU vertex mismatch');
            maxScaledVertexError=Math.max(maxScaledVertexError,error);
          }
          if(show)r.finish?.();
          rows.push({name:r.name,active:r.active?.()??true,joints:model.tree.nodes.length,meshes:model.meshes.length,draws,vertices:positions.length/3,maxScaledVertexError,textureBindings,texgenTypes:[...texgenTypes],modelMatrixChecks});
        }
        const materialDraws=materialRenderer?.flush();
        if(gl.getError()!==gl.NO_ERROR)throw Error('Native match preview GPU failure');
        return {materialShaderChecks,materialDraws,resolution:[canvas.width,canvas.height],actors:rows,tevPrograms:[...programs.values()],pixelStates:[...pixelStates.values()],renderContext,lightStates:[...lightStates.values()],eye:Array.from(snapshot.eye),interest:Array.from(snapshot.interest),fov:snapshot.fov,aspect:snapshot.aspect,near:snapshot.near,far:snapshot.far,playable:false,performanceMeasured:false,visualParity:false,limitations:materials?'Native material draw integration; complete draw callbacks/pass sorting, image invalidation, exact texture filtering, effects, HUD and stage callbacks remain incomplete.':'Diagnostic first-UV shader; native material state is captured but not rendered.'};
      },dispose,
    };
  } catch(error){dispose();throw error;}
}
