import {commandFields} from './command-fields.mjs';
const mask=width=>2**width-1;
function extract(word,field) {
  const value=Math.floor((word>>>0)/2**field.shift)%2**field.width;
  return field.signed&&value>=2**(field.width-1)?value-2**field.width:value;
}
export function verifyCommandFields(module,{diagnose=false}={}) {
  if(module._portCommandFieldCount()!==commandFields.length)throw Error('Command field manifest mismatch');
  const pointer=module._malloc(20),failures=new Set();let reads=0,writes=0,unitReads=0;
  const words=[0,0xffffffff,0x80000000,0x7fffffff,0x12345678,0x89abcdef];let seed=0x579abc12;
  for(let i=0;i<250;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;words.push(seed);}
  const check=(ok,field,message)=>{if(!ok){failures.add(field.view+'.'+field.path);if(!diagnose)throw Error('Native command '+field.path+': '+message);}};
  try {
    for(const [index,field] of commandFields.entries()) {
      for(const word of words) {
        const view=new DataView(module.HEAPU8.buffer);for(let i=0;i<5;i++)view.setUint32(pointer+i*4,i===field.word?word:0xa55aa55a,true);
        const actual=module._portCommandFieldRead(index,pointer),expected=extract(word,field);reads++;
        check(actual===expected,field,'read '+actual+' != '+expected+' for '+word.toString(16));
      }
      const values=field.signed?[0,-1,-(2**(field.width-1)),2**(field.width-1)-1]:[0,1,mask(field.width)];
      for(const value of values) {
        const view=new DataView(module.HEAPU8.buffer),initial=0x96969696;
        for(let i=0;i<5;i++)view.setUint32(pointer+i*4,initial,true);
        module._portCommandFieldWrite(index,pointer,value);writes++;
        const encoded=value<0?value+2**field.width:value,bitMask=(mask(field.width)*2**field.shift)>>>0;
        const expected=((initial&~bitMask)|(encoded*2**field.shift))>>>0;
        for(let i=0;i<5;i++)check(view.getUint32(pointer+i*4,true)===(i===field.word?expected:initial),field,'write changed wrong bits or adjacent word');
      }
    }
    if(!diagnose) {
      for(const word of words) {
        const bytes=new Uint8Array(20),big=new DataView(bytes.buffer),view=new DataView(module.HEAPU8.buffer);
        for(let i=0;i<5;i++){const value=(word+i*0x1020304)>>>0;big.setUint32(i*4,value);view.setUint32(pointer+i*4,value,true);}
        for(const [type,count,method,stride] of [[8,20,'getUint8',1],[16,10,'getUint16',2],[17,10,'getInt16',2]])
          for(let index=0;index<count;index++) {
            const actual=module._portCommandReadUnit(pointer,type,index),expected=big[method](index*stride);unitReads++;
            if(actual!==expected)throw Error('Command byte/halfword view mismatch');
          }
        const low=word&4095,expected=low<2048?low:low-4096;unitReads++;
        if(module._portCommandReadUnit(pointer,12,0)!==expected)throw Error('Throw angle sign extension mismatch');
      }
      const test=(path,word,expected,viewName='command',wordIndex=0)=>{
        const index=commandFields.findIndex(f=>f.view===viewName&&f.path===path);if(index<0)throw Error('Named command fixture missing');
        const view=new DataView(module.HEAPU8.buffer);view.setUint32(pointer+wordIndex*4,word,true);
        check(module._portCommandFieldRead(index,pointer)===expected,commandFields[index],'named command fixture');
      };
      const hit=((11<<26)|(3<<23)|(5<<20)|(1<<19)|(42<<11)|(1<<10)|17)>>>0;
      for(const [name,value] of Object.entries({opcode:11,id:3,hit_group:5,only_hit_grabbed:1,bone:42,use_common_bone_ids:1,damage:17}))
        test('create_hitbox_0.'+name,hit,value);
      test('create_hitbox_1.z_offset',0x0100ff80,-128);test('create_hitbox_1.size',0x0100ff80,256);
      for(const [i,name] of ['r','g','b','a'].entries())test('light_color.'+name,0x12345678,[0x12,0x34,0x56,0x78][i],'color');
      test('x594_b4',0x08000009,1,'fighterAnim');test('x597_bits',0x08000009,9,'fighterAnim');
      test('x594_bits',0x003ffe00,8191,'fighterAnim');test('x596_bits.x7',0x1c0,7,'fighterAnim');
      test('xF_b4',8,1,'skip',3);test('xF_b4',0,0,'skip',3);
    }
  } finally {module._free(pointer);}
  return {passed:failures.size===0,fields:commandFields.length,reads,writes,unitReads,failingFields:[...failures],
    representation:'native numeric command words retaining PPC MSB-first fields',gameplayParity:false};
}

export function verifyCommandControl(module) {
  const program=module._malloc(48);if(!program)throw Error('Command program allocation failed');
  const v=new DataView(module.HEAPU8.buffer),words=[(3<<26)|3,(1<<26)|2,4<<26,5<<26,program+32,(2<<26)|12,7<<26,program+40,(1<<26)|1,6<<26,8<<26,0];
  words.forEach((w,i)=>v.setUint32(program+i*4,w,true));
  const state=module._portCommandControlCreate(program);let steps=0;
  const step=(opcode,index,loop,timer)=>{
    module._portCommandControlStep(state,opcode);steps++;
    const actual=[0,2,3].map(field=>module._portCommandControlRead(state,field));
    if(actual[0]!==timer||actual[1]!==index||actual[2]!==loop)throw Error('Original command control mismatch: '+JSON.stringify({opcode,actual,index,loop,timer}));
  };
  try {
    step(3,1,2,0);step(1,2,2,2);step(4,1,2,2);step(1,2,2,4);step(4,1,2,4);step(1,2,2,6);step(4,3,0,6);
    step(5,8,1,6);step(1,9,1,7);step(6,5,0,7);
    module._portCommandControlFrame(state,4);step(2,6,0,8);step(7,10,0,8);step(8,11,0,3.4028234663852886e38);step(0,-1,0,3.4028234663852886e38);
  } finally {module._portCommandControlDestroy(state);module._free(program);}
  const nested=verifyNestedCommandControl(module);
  return {passed:true,steps,nested,originalFunctions:['Command_00','Command_01','Command_02','Command_03','Command_04','Command_05','Command_06','Command_07','Command_08'],
    limitation:'Timer/loop/subroutine/goto primitives, not the fighter action-state loop'};
}

function verifyNestedCommandControl(module) {
  const program=module._malloc(36);if(!program)throw Error('Nested program allocation failed');
  const v=new DataView(module.HEAPU8.buffer),words=[(3<<26)|2,(3<<26)|2,5<<26,program+28,4<<26,4<<26,0,(1<<26)|1,6<<26];
  words.forEach((w,i)=>v.setUint32(program+i*4,w,true));
  const state=module._portCommandControlCreate(program);let steps=0,maxDepth=0;
  try {
    const expected=[
      [3,1,2,0],[3,2,4,0],[5,7,5,0],[1,8,5,1],[6,4,4,1],[4,2,4,1],
      [5,7,5,1],[1,8,5,2],[6,4,4,2],[4,5,2,2],[4,1,2,2],
      [3,2,4,2],[5,7,5,2],[1,8,5,3],[6,4,4,3],[4,2,4,3],
      [5,7,5,3],[1,8,5,4],[6,4,4,4],[4,5,2,4],[4,6,0,4],[0,-1,0,4]
    ];
    for(const [opcode,index,depth,timer] of expected) {
      module._portCommandControlStep(state,opcode);steps++;maxDepth=Math.max(maxDepth,depth);
      const actual=[2,3,0].map(field=>module._portCommandControlRead(state,field));
      if(actual[0]!==index||actual[1]!==depth||actual[2]!==timer)throw Error('Nested original command control mismatch: '+JSON.stringify({steps,actual,index,depth,timer}));
    }
  }finally{module._portCommandControlDestroy(state);module._free(program);}
  return {passed:true,steps,maxDepth};
}
