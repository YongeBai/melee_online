import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

// Ask the same WASM compiler for layouts. Offset comments in the decomp are not
// an ABI source, and blanket word swapping would corrupt packed colors/flags.
export function readAttributeSpec(upstream,output,compiler) {
  const table=fs.readFileSync(path.join(upstream,'src/melee/ft/ftdata.c'),'utf8');
  const match=/ftKindCalcIndiviParamTable\[Ft_Kind_Max\]\s*=\s*\{([^}]+)\}/.exec(table);
  if(!match)throw Error('Missing character attribute loader table');
  const callbacks=match[1].split(',').map(s=>s.trim()).filter(Boolean).slice(0,27),functions=new Map();
  const files=execFileSync('rg',['--files','src/melee/ft/kinds','-g','*.c'],{cwd:upstream,encoding:'utf8'}).trim().split('\n').sort();
  for(const file of files) {
    const source=fs.readFileSync(path.join(upstream,file),'utf8');
    for(const m of source.matchAll(/void (\w+_Init_LoadSpecialAttrs)\([^)]*\)\s*\{/g)) {
      let end=m.index+m[0].length,depth=1,start=end;
      for(;end<source.length&&depth;end++){if(source[end]==='{')depth++;if(source[end]==='}')depth--;}
      if(depth)throw Error('Unclosed attribute loader');
      functions.set(m[1],{file,body:source.slice(start,end-1)});
    }
  }
  function resolve(name,seen=new Set()) {
    if(seen.has(name)||!functions.has(name))throw Error('Invalid attribute loader chain');seen.add(name);
    const {body}=functions.get(name),type=/COPY_ATTRS\(\w+,\s*(\w+)\)/.exec(body)?.[1];if(type)return type==='ftKb_DatAttrs'?'struct ftKb_DatAttrs':type;
    const calls=[...body.matchAll(/(\w+_Init_LoadSpecialAttrs)\(/g)];if(calls.length!==1)throw Error('Unknown attribute loader: '+name);
    return resolve(calls[0][1],seen);
  }
  const types=[...new Set(callbacks.map(name=>resolve(name)))];
  const probe=path.join(output,'attribute-layout.c');
  fs.writeFileSync(probe,'#include <melee/ft/types.h>\n'+types.map((type,i)=>`struct PortAttribute_${i} { ${type} value; };`).join('\n')+'\n');
  const text=execFileSync(compiler,['-I'+path.join(output,'include'),'-I'+path.join(output,'portable/src'),'-I'+path.join(output,'portable/libs/dolphin/include'),
    '-Xclang','-fdump-record-layouts-complete','-fsyntax-only',probe],{cwd:upstream,encoding:'utf8',maxBuffer:8*1024**2});
  const records=types.map((type,i)=>({...parseAttributeLayout(text,'PortAttribute_'+i),type}));
  // Compare the same records under a 32-bit big-endian PowerPC ABI. Defining
  // __EMSCRIPTEN__ selects the existing ssize_t compatibility header, not a
  // WASM target; this is a layout check, not an executable PPC reference run.
  const target='powerpc-unknown-none-eabi',emscripten=path.dirname(compiler);
  const ppc=spawnSync(path.resolve(emscripten,'../bin/clang'),['--target='+target,'-D__EMSCRIPTEN__=1',
    '-I'+path.join(output,'include'),'-I'+path.join(output,'portable/src'),'-I'+path.join(output,'portable/libs/dolphin/include'),
    '-I'+path.join(emscripten,'cache/sysroot/include'),'-Xclang','-fdump-record-layouts-complete','-fsyntax-only',probe],
    {cwd:upstream,encoding:'utf8',maxBuffer:8*1024**2});
  fs.writeFileSync(path.join(output,'attribute-ppc-diagnostics.log'),ppc.stderr||'');
  if(ppc.error||ppc.status!==0)throw Error('PowerPC attribute layout check failed: '+(ppc.error?.message||ppc.stderr));
  for(const [i,{type,...wasm}] of records.entries())if(JSON.stringify(parseAttributeLayout(ppc.stdout,'PortAttribute_'+i))!==JSON.stringify(wasm))
    throw Error('PowerPC/WASM attribute layout mismatch: '+type);
  return {records,layoutComparison:{target,matchingRecords:records.length},characters:callbacks.map((callback,kind)=>({kind,callback,file:functions.get(callback).file,record:types.indexOf(resolve(callback))})),
    sourceSha256:createHash('sha256').update(table+callbacks.map(n=>functions.get(n).body).join('')).digest('hex')};
}

export function parseAttributeLayout(text,name) {
  const block=text.split('*** Dumping AST Record Layout\n').find(b=>b.split('\n')[0].trim()==='0 | struct '+name);
  if(!block)throw Error('Missing compiler attribute layout: '+name);
  const size=Number(/\[sizeof=(\d+), align=/.exec(block)?.[1]);if(!size)throw Error('Invalid attribute size');
  const rows=block.split('\n').slice(1).filter(l=>/\|\s+\S/.test(l)&&!l.includes('[sizeof=')),fields=[],stack=[];
  for(let i=0;i<rows.length;i++) {
    const m=/^\s*(\d+) \|(\s+)(.+) (\w+)\s*$/.exec(rows[i]);if(!m)throw Error('Unsupported attribute layout line: '+rows[i]);
    const offset=Number(m[1]),indent=m[2].length,type=m[3],member=m[4];
    while(stack.length&&stack.at(-1).indent>=indent)stack.pop();
    const chain=[...stack.map(s=>s.member),member];
    if(name.startsWith('PortAttribute_')&&chain[0]==='value')chain.shift();
    const path=chain.join('.');
    const next=/^\s*\d+ \|(\s+)/.exec(rows[i+1]||'');
    if(next&&next[1].length>indent){stack.push({indent,member});continue;}
    const array=/^(.*?)\[(\d+)\]$/.exec(type),element=array?.[1]||type,count=Number(array?.[2]||1);
    const numeric={float:[4,'float'],f32:[4,'float'],int:[4,'word'],s32:[4,'word'],u32:[4,'word'],u16:[2,'half'],s16:[2,'half'],u8:[1,'byte'],s8:[1,'byte'],char:[1,'byte'],'unsigned char':[1,'byte'],ItemKind:[4,'word'],FtMotionId:[4,'word'],'void *':[4,'opaque']};
    const info=numeric[element];
    if(element.startsWith('struct ')) {
      const nested=parseAttributeLayout(text,element.slice(7));
      for(let j=0;j<count;j++)for(const f of nested.fields)fields.push({...f,name:path+(array?'['+j+']':'')+'.'+f.name,offset:offset+j*nested.size+f.offset});
    } else if(element==='GXColor') {
      for(let j=0;j<count;j++)for(const [k,c] of ['r','g','b','a'].entries())fields.push({name:path+(array?'['+j+']':'')+'.'+c,offset:offset+j*4+k,width:1,kind:'byte'});
    } else {
      if(!info)throw Error('Unsupported attribute field type: '+type+' '+path);
      for(let j=0;j<count;j++)fields.push({name:path+(array?'['+j+']':''),offset:offset+j*info[0],width:info[0],kind:info[1]});
    }
  }
  const covered=new Set();for(const f of fields)for(let i=0;i<f.width;i++) {
    const at=f.offset+i;if(at>=size||covered.has(at))throw Error('Overlapping attribute field');covered.add(at);
  }
  return {size,fields};
}

export function attributeProbeSource(spec) {
  return '#include <melee/ft/types.h>\n#include <stddef.h>\n#include <stdint.h>\n#include <string.h>\n#include <stdlib.h>\n'+
    ['xEC','xF0','xF4','specialhi_base_angle','xFC','x100','x104','x108','x10C','x110'].map(name=>
      `_Static_assert(offsetof(ftYoshiAttributes,${name})==offsetof(struct ftYs_DatAttrs,${name}) && sizeof(((ftYoshiAttributes*)0)->${name})==sizeof(((struct ftYs_DatAttrs*)0)->${name}),"Yoshi attribute overlay ${name}");\n`).join('')+
    spec.records.map((r,i)=>`_Static_assert(sizeof(${r.type})==${r.size},"Attribute size");\n`+
      r.fields.map(f=>`_Static_assert(offsetof(${r.type},${f.name})==${f.offset} && sizeof(((${r.type}*)0)->${f.name})==${f.width},"Attribute field ${f.name}");`).join('\n')+
      `\nstatic unsigned read_${i}(const ${r.type}* data,unsigned field){unsigned out=0;switch(field){\n`+
      r.fields.map((f,j)=>`case ${j}:memcpy(&out,&data->${f.name},${f.width});return out;`).join('\n')+'\ndefault:abort();}}\n').join('\n')+
    'unsigned portAttributeField(const void* data,unsigned record,unsigned field){switch(record){\n'+
    spec.records.map((_,i)=>`case ${i}:return read_${i}(data,field);`).join('\n')+'\ndefault:abort();}}\n'+
    'unsigned portAttributeSize(unsigned kind){switch(kind){\n'+spec.characters.map(c=>`case ${c.kind}:return sizeof(${spec.records[c.record].type});`).join('\n')+'\ndefault:abort();}}\n';
}
