import {initializeFighterArticleArchive} from './article-assets.mjs';
import {convertItemModels} from './item-model-assets.mjs';
import {installResidentFile,openResidentArchive} from './resident-files.mjs';
export function verifyItemModels(module,fighters) {
  let checks=0,instances=0,updates=0,maxError=0;const rows=[];
  const check=(ok,message)=>{checks++;if(!ok)throw Error('Item models: '+message);};
  const view=()=>new DataView(module.HEAPU8.buffer),ptr=at=>view().getUint32(at,true);
  const flags=module._malloc(0x84);module.HEAPU8.fill(0,flags,flags+0x84);
  try {for(let value=0;value<65536;value++){module.HEAPU8[flags]=value>>>8;module.HEAPU8[flags+1]=value&255;check(module._portItemAttrFlags(flags)===value,'original packed attribute bits');}}finally{module._free(flags);}
  const baseline={live:module._portSceneLiveObjects(),objects:module._portRuntimeObjectsUsed(),files:module._portFileAllocations()};
  check(module._portOriginalItemModelLive()===0,'clean item model pool');
  for(const {name,bytes} of fighters) {
    const source=convertItemModels(name==='PlNn.dat'?initializeFighterArticleArchive(bytes,'Nn'):bytes,name);if(!source.rows.length){rows.push({name,articles:[]});continue;}
    const filename=name.replace('.dat','Items.dat');installResidentFile(module,filename,source.image);const file=openResidentArchive(module,filename,['native_item_models']);
    const root=file.addresses[0],base=root-source.root,table=ptr(root+4),articles=[];
    try {
      check(ptr(root)===source.rows.length,'native item model table length');
      for(const [index,row] of source.rows.entries()) {
        const n=row.scene?.model.tree.nodes.length??1,objects=[],nodes=[module._malloc(n*4),module._malloc(n*4)],matrices=[module._malloc(n*48),module._malloc(n*48)];
        try {
          check(module._portItemAttrFlags(base+row.attributes)===(row.flags[0]<<8|row.flags[1]),'source attribute bits');
          for(let i=0;i<row.scalars.length;i++) {
            const at=4+i*4,value=at!==8&&at<0x64?view().getFloat32(base+row.attributes+at,true):ptr(base+row.attributes+at);
            check(value===row.scalars[i],'source item parameter');
          }
          for(let instance=0;instance<2;instance++) {
            const object=module._portItemModelCreate(table+index*12);check(object,'original item model setup');objects.push(object);instances++;
            check(module._portSceneCollect(module._portSceneObjectRoot(object),nodes[instance],n)===n,'item joint hierarchy');
            check(module._portItemModelRead(object,0,0)===row.hurtboxes.length,'original item hurtbox count');
            check(Boolean(module._portItemModelRead(object,1,0))===Boolean(row.boneCount),'original item bone table allocation');
            for(let bone=0;bone<row.boneCount;bone++)check(module._portItemModelRead(object,2,bone)===ptr(nodes[instance]+bone*4),'original item bone table order');
            const materials=row.scene?.metrics[3]??0;check(module._portItemModelRead(object,4,0)===materials,'original item material class');
            if(row.scene)for(const metric of [1,3,4,5,6,7]) {
              const value=module._portSceneMetric(n,nodes[instance],metric),expected=row.scene.metrics[metric];
              check(Math.abs(value-expected)<1e-5*(1+Math.abs(expected)),'item scene descriptors and own skin references');
            }
            for(const [h,hurt] of row.hurtboxes.entries()) {
              check(module._portItemModelRead(object,20,h)===0,'original hurtbox enabled state');
              check(module._portItemModelRead(object,21,h)===ptr(nodes[instance]+hurt.bone*4)&&module._portItemModelRead(object,22,h)===hurt.scale,'original hurtbox bone/size');
            }
          }
          for(let bone=0;bone<n;bone++)check(ptr(nodes[0]+bone*4)!==ptr(nodes[1]+bone*4),'independent item joints');
          const initialScale=row.scalars[(0x60-4)/4];
          for(const multiplier of [1,.5,2,1]) {
            const scale=Math.fround(initialScale*multiplier),translation=[1.25,-2.5,3.75];
            for(let instance=0;instance<2;instance++) {
              const object=objects[instance];module._portItemModelTransform(object,scale,...translation);updates++;
              check(module._portItemModelRead(object,3,0)===scale,'original item scale routine');
              module._portSceneMatrices(n,nodes[instance],matrices[instance]);
              const m=new Float32Array(module.HEAPU8.buffer,matrices[instance],n*12);
              for(const [h,hurt] of row.hurtboxes.entries())for(const [endpoint,offset] of [hurt.a,hurt.b].entries())for(let axis=0;axis<3;axis++) {
                const k=hurt.bone*12+axis*4,expected=Math.fround(Math.fround(Math.fround(Math.fround(m[k]*offset[0])+Math.fround(m[k+1]*offset[1]))+Math.fround(m[k+2]*offset[2]))+m[k+3]);
                const actual=module._portItemModelRead(object,23+endpoint*3+axis,h),error=Math.abs(actual-expected);maxError=Math.max(maxError,error);
                check(Number.isFinite(actual)&&error<1e-5*(1+Math.abs(expected)),'original item hurtbox world coordinates');
              }
            }
            const a=new Float32Array(module.HEAPU8.buffer,matrices[0],n*12),b=new Float32Array(module.HEAPU8.buffer,matrices[1],n*12);
            for(let i=0;i<a.length;i++)check(Number.isFinite(a[i])&&Object.is(a[i],b[i]),'finite independent item matrices');
          }
          articles.push({slot:row.slot,modelNodes:n,hasModel:!!row.scene,boneTable:row.boneCount,meshes:row.scene?.model.meshes.length??0,hurtboxes:row.hurtboxes.length});
        } finally {for(const o of objects)module._portSceneObjectFree(o);for(const p of [...nodes,...matrices])module._free(p);}
        check(module._portOriginalItemModelLive()===0&&module._portSceneLiveObjects()===baseline.live&&module._portRuntimeObjectsUsed()===baseline.objects,'item object/material/bone teardown');
      }
      rows.push({name,articles});
    } finally {file.dispose();check(module._portFileClear()===0,'item prefetch release');}
    check(module._portFileAllocations()===baseline.files,'item archive teardown');
  }
  return {passed:true,checks,packedFlagChecks:65536,instances,updates,maxError,rows,
    limitation:'Original item model, material class, bone table, scale and hurtbox initialization/world transforms. No item spawn/state scripts, special attributes, projectiles in gameplay, stage collisions or GPU material submission.'};
}
