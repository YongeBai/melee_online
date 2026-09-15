import {sharedSpec} from './shared-spec.mjs';
import {convertSharedParameters,sharedSections,pendingSharedSections} from './shared-assets.mjs';
import {installResidentFile,openResidentArchive} from './resident-files.mjs';
export function verifyShared(module,input) {
  const converted=convertSharedParameters(input,sharedSpec);
  installResidentFile(module,'PlCo.dat',converted.image);
  const file=openResidentArchive(module,'PlCo.dat',['native_shared_parameters']),root=file.addresses[0];
  const view=()=>new DataView(module.HEAPU8.buffer),pointer=section=>view().getUint32(root+sharedSections.indexOf(section)*4,true);
  const parameters=pointer(0),parts=pointer(4),groups=pointer(5);let fieldReads=0,partLookups=0,remaps=0,groupChecks=0,landings=0;
  const scratch=module._malloc(12);if(!scratch)throw Error('Shared verification allocation failed');
  try {
    const methods={float:'getFloat32',int:'getInt32',u32:'getUint32',u8:'getUint8'};
    for(const [i,field] of sharedSpec.fields.entries()) {
      const expected=converted.archive.data[methods[field.type]](converted.common+field.offset),actual=module._portSharedField(parameters,i);fieldReads++;
      if(!Object.is(actual,expected))throw Error('Original shared field mismatch: '+field.name);
      const d=view(),at=parameters+field.offset,size=field.type==='u8'?1:4,original=module.HEAPU8.slice(at,at+size);
      const value=field.enumMax!==undefined?3:{float:Math.fround(-1.2345),int:-1234567,u32:0xfedcba98,u8:0xa5}[field.type];
      d[methods[field.type].replace('get','set')](at,value,true);
      if(!Object.is(module._portSharedField(parameters,i),value))throw Error('Shared field signedness or scalar type mismatch: '+field.name);fieldReads++;
      module.HEAPU8.set(original,at);
    }
    for(const to of converted.parts) {
      for(let part=0;part<56;part++) {
        if(module._portSharedPart(parts,groups,0,to.kind,0,part)!==to.partToJoint[part])throw Error('Original bone lookup mismatch');partLookups++;
      }
      for(const from of converted.parts)for(let joint=0;joint<=from.count+1;joint++) {
        const part=joint<from.count?from.jointToPart[joint]:255,expected=part===255?255:to.partToJoint[part];
        if(module._portSharedPart(parts,groups,1,to.kind,from.kind,joint)!==expected)throw Error('Original bone remapping mismatch');remaps++;
      }
      const group=converted.groups.find(g=>g.kind===to.kind);
      for(let part=0;part<140;part++) {
        let expected=0;if(group)for(let i=0;i<group.count;i++)if(group.bytes[i*4]===part){expected=2**i;break;}
        if(module._portSharedPart(parts,groups,2,to.kind,0,part)!==expected)throw Error('Original model-part group mismatch');groupChecks++;
      }
    }
    const field=sharedSpec.fields.find(f=>f.name==='max_grounded_kb_on_landing'),limit=converted.archive.data.getFloat32(converted.common+field.offset);
    for(const speed of [-100,-limit,-1,0,1,limit,100])for(const [x,y] of [[0,1],[0.6,0.8],[-0.6,0.8]]) {
      const velocity=Math.fround(speed),nx=Math.fround(x),ny=Math.fround(y),clamped=Math.max(-limit,Math.min(limit,velocity));
      module._portSharedLanding(parameters,velocity,nx,ny,scratch);
      const expected=[clamped,Math.fround(ny*clamped),Math.fround(-nx*clamped)];
      for(let i=0;i<3;i++)if(!Object.is(module.HEAPF32[scratch/4+i],expected[i]))throw Error('Original shared landing knockback mismatch');landings++;
    }
    return {passed:true,fieldReads,fields:sharedSpec.fields.length,partLookups,remaps,groupChecks,landings,
      sections:sharedSections,pendingSections:pendingSharedSections,parts:converted.parts.length,metrics:converted.metrics,
      fullCommonDataLoaded:false,playable:false};
  } finally {module._free(scratch);file.dispose();if(module._portFileClear()!==0)throw Error('Shared archive remained pinned');}
}
