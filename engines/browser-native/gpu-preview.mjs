import {convertSceneAsset,loadSceneAnimation} from './scene-assets.mjs';
import {installResidentFile,openResidentArchive} from './resident-files.mjs';
import {readModelMeshes} from './mesh-assets.mjs';
import {readModelMaterials} from './material-assets.mjs';
import {textureMatrices} from './texture-matrix.mjs';
import {readSkinBindings,loadSkin} from './skin-assets.mjs';
import {loadPose} from './verify-poses.mjs';
import {animationArchives} from './animation-assets.mjs';
import {createMeshPipeline,uploadMesh} from './gpu-mesh.mjs';
import {verifyGpuConventions} from './verify-gpu-conventions.mjs';
import {inspectArchive} from './archive.mjs';
import {readNativeTev} from './native-tev.mjs';
import {verifyGpuTev} from './verify-tev.mjs';
import {readNativeTextures,decodeNativeTexture,gxTextureLod} from './native-texture.mjs';
import {readNativePixel} from './native-pixel.mjs';
import {verifyNativePixel} from './verify-material-state.mjs';
import {createNativeModelProbe} from './verify-model-state.mjs';
import {verifySkinArithmetic} from './verify-skin.mjs';
const canvas=document.querySelector('canvas'),status=document.querySelector('#status'),result=document.querySelector('#result');
const parameters=new URL(location.href).searchParams;
const fullScene=parameters.get('scene')==='1';
const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:true,preserveDrawingBuffer:true});
async function fetchAsset(name) {
  if(!/^Pl[A-Za-z0-9]+\.(dat|usd)$/.test(name))throw Error('Invalid hosted model name');
  const response=await fetch('./fixtures/'+name);if(!response.ok)throw Error('Hosted asset unavailable: '+name);
  return new Uint8Array(await response.arrayBuffer());
}
function columnMajor(rows) {return Float32Array.from({length:16},(_,i)=>rows[i%4*4+(i>>2)]);}
try {
  if(!gl)throw Error('WebGL2 unavailable');
  const {default:createMeleeNative}=await import(fullScene?'./melee-scene.mjs':'./melee-native.mjs');
  const module=await createMeleeNative();if(module._portRuntimeInit()<0)throw Error('Native runtime initialization failed');
  const pipeline=createMeshPipeline(gl),scratch=module._malloc(144);
  const conventions=verifyGpuConventions(gl,pipeline);
  const skinArithmetic=verifySkinArithmetic(module);
  // Diagnostic front view only. The actual gameplay camera must come from the
  // native match; no pitch/yaw/projection adjustment is applied to /play/.
  module.HEAPF32.set([0,12,75,0,1,0,0,12,0],scratch/4);
  module._C_MTXLookAt(scratch+36,scratch,scratch+12,scratch+24);
  const view=columnMajor([...module.HEAPF32.slice((scratch+36)/4,(scratch+84)/4),0,0,0,1]);
  module._MTXPerspective(scratch,45,4/3,1,500);
  const projection=columnMajor(module.HEAPF32.slice(scratch/4,scratch/4+16));module._free(scratch);
  const manifest=await (await fetch('./model-fixtures.json')).json(),rows=[],tevPrograms=new Map(),pixelStates=new Map();
  const selected=parameters.get('model')||'PlMrNr.dat';if(!manifest.includes(selected))throw Error('Model not in hosted manifest');
  const names=parameters.get('verify')==='1'?manifest:[selected],residentModels=new Map();
  async function load(name,referenceVertices) {
    const [bytes,motion]=await Promise.all([fetchAsset(name),fetchAsset(name.replace('Nr','AJ'))]);
    const model=readModelMeshes(bytes),assets=readModelMaterials(bytes,model),transforms=textureMatrices(module,assets.textures);
    let pose,materialCount=0,textureChecks=0,texturePixelChecks=0,textureMatrixChecks=0,texgenTypes=new Set();
    if(fullScene) {
      if(!residentModels.has(name)) {
        const converted=convertSceneAsset(bytes);
        const symbol=[...converted.archive.publics].find(([,at])=>at===converted.rootOffset)?.[0];
        if(!symbol)throw Error('Typed native joint symbol missing');
        installResidentFile(module,name,converted.image);residentModels.set(name,symbol);
      }
      const asset=openResidentArchive(module,name,[residentModels.get(name)]),n=model.tree.nodes.length;
      let nodes,clip,object;
      const dispose=()=>{
        if(object){module._portSceneObjectFree(object);object=0;}
        clip?.dispose();clip=null;asset.dispose();if(nodes){module._free(nodes);nodes=0;}
      };
      try {
        nodes=module._malloc(n*4);if(!nodes)throw Error('Native node allocation failed');
        const length=new DataView(motion.buffer,motion.byteOffset,4).getUint32(0);
        clip=loadSceneAnimation(module,motion.subarray(0,length));
        object=module._portSceneObjectCreate(asset.addresses[0]);
        const root=object&&module._portSceneObjectRoot(object);
        if(!root||module._portSceneCollect(root,nodes,n)!==n||module._portSceneAnimation(n,nodes,clip.tree)!==0)
          throw Error('Native HSD animation attachment failed');
        module._portSceneRequest(root);
        const archive=inspectArchive(bytes),seen=new Set();
        for(const mesh of model.meshes) {
          if(seen.has(mesh.dobj))continue;seen.add(mesh.dobj);
          let at=model.tree.nodes[mesh.joint].display,index=0;
          while(at!==mesh.dobj){if(at===null||index++>=4096)throw Error('Model TEV DObj ownership');at=archive.relocations.has(at+4)?archive.data.getUint32(at+4):null;}
          const joint=new Uint32Array(module.HEAPU8.buffer,nodes,n)[mesh.joint],program=readNativeTev(module,joint,index);
          const key=JSON.stringify(program.stages);if(!tevPrograms.has(key))tevPrograms.set(key,program);materialCount++;
          const native=readNativeTextures(module),source=assets.materials.get(mesh.material);
          const pixel=readNativePixel(module);verifyNativePixel(source,pixel);
          const pixelKey=JSON.stringify(pixel);if(!pixelStates.has(pixelKey))pixelStates.set(pixelKey,{state:pixel,materials:0});pixelStates.get(pixelKey).materials++;
          const descriptors=[];for(let t=source.texture;t;t=t.next)descriptors.push(t);
          if(native.textures.length!==descriptors.length)throw Error('Native/source texture count: '+name);
          for(const [ti,t] of native.textures.entries()) {
            const original=descriptors[ti],levels=decodeNativeTexture(module,t);
            if(t.width!==original.image.width||t.height!==original.image.height||t.format!==original.image.format||t.wrapS!==original.wrapS||t.wrapT!==original.wrapT||t.magFilter!==original.magFilter||levels.length!==original.image.levels.length)
              throw Error('Native/source texture configuration: '+name);
            let minFilter=original.lod?.minFilter??5;if([8,9,10].includes(t.format)&&minFilter===5)minFilter=3;if(!original.image.mipmap)minFilter&=1;
            const lod=gxTextureLod(original.image.minLOD,original.image.maxLOD,original.lod?.bias??0);
            if(t.minFilter!==minFilter||Object.keys(lod).some(k=>t.lod[k]!==lod[k]))throw Error('Native/source texture filtering: '+name);
            if((original.flags&15)===0) {
              const matrix=native.matrices.find(m=>m.id===((original.flags&0x1000000)?57:64+t.id*3)),expected=transforms.get(original.offset);
              const count=matrix?.type===1?8:12;
              if(!matrix||matrix.values.slice(0,count).some((v,i)=>v!==expected[i]))throw Error('Native/source UV texture matrix: '+name);
              textureMatrixChecks++;
            }
            for(const [level,image] of levels.entries()) {
              const expected=original.image.levels[level];
              if(image.pixels.length!==expected.pixels.length||image.pixels.some((v,i)=>v!==expected.pixels[i]))throw Error('Native/source texture pixels: '+name);
              texturePixelChecks+=image.pixels.length/4;
            }
            textureChecks++;
          }
          for(const g of native.generators)texgenTypes.add(g.type+'/'+g.source+'/'+g.normalize);
        }
        pose={nodes,step(world,flags){module._portSceneAnimate(root);module._portSceneMatrices(n,nodes,world);module._portSceneFlags(n,nodes,flags);},dispose};
      } catch(error){dispose();throw error;}
    } else {
      const limited=loadPose(module,model.tree,animationArchives(motion).next().value.tree);
      pose={step(world,flags){module._portPoseStep(limited.pointer,world);module._portPoseFlags(limited.pointer,flags);},dispose:limited.dispose};
    }
    let skin,gpu,flags,modelProbe;
    try {
      skin=loadSkin(module,model,readSkinBindings(bytes,model),{referenceVertices});
      gpu=uploadMesh(gl,pipeline,model,skin,assets,transforms);flags=module._malloc(model.tree.nodes.length*4);
      if(fullScene)modelProbe=createNativeModelProbe(module,model,bytes,pose.nodes,skin);
      return {model,pose,skin,gpu,materialCount,textureChecks,texturePixelChecks,textureMatrixChecks,texgenTypes:[...texgenTypes],
        checkModel(){return modelProbe?.check(Float32Array.from({length:12},(_,i)=>view[(i%4)*4+Math.floor(i/4)]));},
        step(){pose.step(skin.world,flags);skin.step();
          gpu.updatePalette(module.HEAPF32.subarray(skin.matrices/4,skin.matrices/4+skin.groupCount*12));},
        draw(){gl.viewport(0,0,960,720);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
          const draws=gpu.draw(view,projection,new Uint32Array(module.HEAPU8.buffer,flags,model.tree.nodes.length));
          const error=gl.getError();if(error!==gl.NO_ERROR)throw Error('GPU error: '+error);return draws;},
        dispose(){modelProbe?.dispose();gpu.dispose();skin.dispose();pose.dispose();module._free(flags);}};
    } catch(error){modelProbe?.dispose();gpu?.dispose();skin?.dispose();pose.dispose();if(flags)module._free(flags);throw error;}
  }
  for(const name of names) {
    status.textContent='Verifying native GPU resources: '+name;
    const actor=await load(name,true),snapshots=[],modelMatrixChecks=[];let maxError=0,maxScaledError=0;
    try {
      for(let frame=0;frame<=32;frame++) {
        actor.step();if(frame%16!==0)continue;
        if(fullScene)modelMatrixChecks.push({frame,...actor.checkModel()});
        const positions=actor.gpu.readPositions(),expected=module.HEAPF32.subarray(actor.skin.transformed/4,actor.skin.transformed/4+positions.length);
        positions.forEach((v,i)=>{const error=Math.abs(v-expected[i]),scaled=error/(1+Math.abs(expected[i]));
          maxError=Math.max(maxError,error);maxScaledError=Math.max(maxScaledError,scaled);
          if(!Number.isFinite(v)||scaled>0.00002)throw Error('GPU/native vertex mismatch: '+name+' '+i+' '+v+' '+expected[i]);});
        const draws=actor.draw(),pixels=new Uint8Array(960*720*4);gl.readPixels(0,0,960,720,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        let coloredPixels=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]||pixels[i+1]||pixels[i+2])coloredPixels++;
        if(coloredPixels<100)throw Error('No visible model pixels: '+name);
        const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',pixels))].map(x=>x.toString(16).padStart(2,'0')).join('');
        snapshots.push({frame,draws,coloredPixels,sha256});
      }
      rows.push({name,vertices:actor.model.totalVertices,paletteMatrices:actor.skin.groupCount,materialCount:actor.materialCount,textureChecks:actor.textureChecks,texturePixelChecks:actor.texturePixelChecks,textureMatrixChecks:actor.textureMatrixChecks,texgenTypes:actor.texgenTypes,maxError,maxScaledError,
        modelMatrixChecks,snapshots,distinctImages:snapshots.some(s=>s.sha256!==snapshots[0].sha256)});
    } finally {actor.dispose();}
  }
  if(fullScene&&(module._portFileAllocations()||module._portRuntimeObjectsUsed()||module._portSceneLiveObjects()))
    throw Error('Native scene benchmark leaked archive or object ownership');
  const tev=fullScene?verifyGpuTev(gl,[...tevPrograms.values()]):null;
  const report={passed:true,originalGameArchiveLoader:fullScene,originalGObjOwnership:fullScene,originalHsdObjects:fullScene,resolution:[960,720],conventions,skinArithmetic,tev,pixelStates:[...pixelStates.values()].map(({state,materials})=>({state,materials})),models:rows,emulator:false,playable:false,gameplayParity:false,
    performanceMeasured:false,renderer:gl.getParameter(gl.RENDERER),
    limitations:'Diagnostic unlit first-UV image; no native lighting, TEV, material animation, part selection, gameplay camera or match simulation'};
  const actor=await load(selected,false);actor.step();actor.draw();
  result.textContent=JSON.stringify(report,null,2);document.documentElement.dataset.result='passed';
  status.textContent='Native animation + GPU mesh diagnostic: '+selected+' · 960 × 720 · not gameplay';
  if(parameters.get('verify')!=='1') {
    let last=performance.now(),debt=0;
    function animate(now) {
      debt=Math.min(100,debt+now-last);last=now;
      while(debt>=1000/60){actor.step();debt-=1000/60;}
      actor.draw();requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
  }
} catch(error) {result.textContent=String(error.stack||error);status.textContent='Native GPU verification failed';document.documentElement.dataset.result='failed';}
