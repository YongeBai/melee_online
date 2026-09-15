import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
// Flatten only known scalar aggregate types. Offsets are computed from their
// declarations, not the decompilation's occasionally incorrect offset comments.
export function readSharedSpec(upstream) {
  const source=['src/melee/ft/types.h','src/melee/lb/forward.h'].map(f=>fs.readFileSync(path.join(upstream,f),'utf8')).join('\n');
  const body=name=>new RegExp('(?:struct|typedef struct) '+name+' \\{([\\s\\S]*?)\\n\\}').exec(source)?.[1];
  const fields=[];let offset=0;
  function walk(text,prefix='') {
    if(!text)throw Error('Missing shared data declaration');
    const declarations=text.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'').split(';').map(x=>x.trim()).filter(Boolean);
    for(const line of declarations) {
      const m=/^(float|int|u32|u8|GXColor|Vec2|Vec3|FallCommon|lbColl_80008D30_arg1|HitCapsuleState|enum_t)\s+(\w+)(?:\[([0-9xa-fA-F\s-]+)\])?$/.exec(line);
      if(!m)throw Error('Unknown shared parameter field: '+line);
      const count=m[3]?m[3].split('-').map(x=>Number(x.trim())).reduce((a,b)=>a-b):1;
      if(!Number.isInteger(count)||count<1||count>32)throw Error('Invalid shared parameter array');
      for(let i=0;i<count;i++) {
        const name=prefix+m[2]+(m[3]?'['+i+']':'');
        if(m[1]==='FallCommon'||m[1]==='lbColl_80008D30_arg1')walk(body(m[1]),name+'.');
        else if(m[1]==='Vec3'||m[1]==='Vec2')for(const c of (m[1]==='Vec3'?['x','y','z']:['x','y'])){fields.push({name:name+'.'+c,type:'float',offset});offset+=4;}
        else if(m[1]==='GXColor')for(const c of ['r','g','b','a'])fields.push({name:name+'.'+c,type:'u8',offset:offset++});
        else {fields.push({name,type:m[1]==='HitCapsuleState'?'u32':m[1]==='enum_t'?'int':m[1],offset,...(m[1]==='HitCapsuleState'?{enumMax:4}:{})});offset+=m[1]==='u8'?1:4;}
      }
    }
  }
  walk(body('ftCommonData'));
  if(offset!==0x818)throw Error('Shared parameter layout changed: '+offset);
  return {size:offset,fields,sourceSha256:createHash('sha256').update(source).digest('hex')};
}
export function sharedProbeSource(spec) {
  return '#include <melee/ft/types.h>\n#include <stddef.h>\n#include <stdlib.h>\n'+
    '_Static_assert(sizeof(ftCommonData)==0x818,"Shared parameter ABI");\n'+
    spec.fields.map(f=>`_Static_assert(offsetof(ftCommonData,${f.name})==${f.offset},"Shared field ${f.name}");`).join('\n')+
    '\ndouble portSharedField(const ftCommonData* data,unsigned index){switch(index){\n'+
    spec.fields.map((f,i)=>`case ${i}:return data->${f.name};`).join('\n')+'\ndefault:abort();}}\n';
}
