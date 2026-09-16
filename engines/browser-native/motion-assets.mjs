import {inspectArchive,nativeSubgraphImage} from './archive.mjs';
import {fighterArchives} from './fighter-assets.mjs';
const fail=message=>{throw Error('Fighter motions: '+message);};
export function readFighterMotions(input,name,spec,{demo=false}={}) {
  const code=/^Pl([A-Za-z]{2})\.dat$/.exec(name)?.[1],kind=spec.codes.indexOf(code),symbol=fighterArchives[code];
  if(kind<0||kind>=27||!symbol)fail('unsupported playable component');
  const archive=inspectArchive(input),d=archive.data,root=archive.publics.get('ftData'+symbol),count=(demo?spec.demoCounts:spec.counts)?.[kind];
  if(!Number.isInteger(count)||count<1||count>1024)fail('invalid motion count');
  if(root===undefined||root+0x60>d.byteLength)fail('invalid fighter root');
  function pointer(at) {
    if(at<0||at+4>d.byteLength)fail('pointer out of bounds');
    const value=d.getUint32(at);if(archive.relocations.has(at))return value;
    if(value!==0)fail('unrelocated pointer');return null;
  }
  function string(at) {
    if(at===null)return null;
    const end=archive.bytes.indexOf(0,32+at);if(end<32+at||end>=32+archive.dataSize)fail('invalid motion symbol string');
    return new TextDecoder('utf-8',{fatal:true}).decode(archive.bytes.subarray(32+at,end));
  }
  const table=pointer(root+(demo?20:12));if(table===null||table%4||table+count*24>d.byteLength)fail('invalid motion table');
  const motions=[];
  for(let i=0;i<count;i++) {
    const at=table+i*24,nameAt=pointer(at),name=string(nameAt),offset=d.getUint32(at+4),size=d.getUint32(at+8),script=pointer(at+12),flags=d.getUint32(at+16);
    if(size>(demo?0xB000:0x8000)||d.getUint32(at+20)!==0||archive.relocations.has(at+20))fail('invalid animation size or prebound pointer');
    if(size&&(!name||offset%32))fail('missing or unaligned animation reference');
    motions.push({index:i,offset:at,name,nameAt,animationOffset:offset,animationSize:size,script,flags});
  }
  const scripts=readMotionScripts(archive,motions.map(m=>m.script).filter(p=>p!==null),spec.commandWords);
  return {archive,kind,code,count,table,motions,scripts,demo};
}

// Visit both call targets and continuations. Loops are kept as command words;
// there is no execution or unrolling here. Shared tails keep their identity.
export function readMotionScripts(archive,starts,lengths,{terminalOpcodes=[0,6,7]}={}) {
  const d=archive.data,commands=new Map(),owners=new Map(),pointers=new Set(),pending=[...starts];
  const bounds=(at,bytes)=>{if(!Number.isSafeInteger(at)||at<0||at%4||at+bytes>d.byteLength)fail('script out of bounds');};
  while(pending.length) {
    let at=pending.pop();bounds(at,4);
    for(;;) {
      if(commands.has(at))break;
      if(owners.has(at))fail('script targets an argument word');
      bounds(at,4);const opcode=d.getUint32(at)>>>26,words=lengths[opcode];
      if(!words)fail('unknown script opcode '+opcode+' at '+at.toString(16));bounds(at,words*4);
      let target=null;
      if(opcode===5||opcode===7) {
        if(archive.relocations.has(at+4)) {
          target=d.getUint32(at+4);bounds(target,4);pointers.add(at+4);pending.push(target);
        } else if(d.getUint32(at+4)!==0)fail('unrelocated branch target');
      }
      for(let i=0;i<words;i++) {
        const slot=at+i*4;if(owners.has(slot))fail('overlapping script commands');owners.set(slot,at);
        if(archive.relocations.has(slot)&&!pointers.has(slot))fail('untyped pointer in script opcode '+opcode+' at '+slot.toString(16));
      }
      commands.set(at,{offset:at,opcode,words,target});
      if(terminalOpcodes.includes(opcode)||(opcode===5&&target===null))break;
      at+=words*4;
    }
  }
  for(const p of pointers)if(!commands.has(d.getUint32(p)))fail('branch target is not a command boundary');
  return {commands,words:owners,pointers};
}

export function convertFighterMotions(input,name,spec,options) {
  const model=readFighterMotions(input,name,spec,options),{archive}=model;
  const data=Uint8Array.from(archive.bytes.subarray(32,32+archive.dataSize)),out=new DataView(data.buffer),pointers=new Set(model.scripts.pointers);
  for(const motion of model.motions)for(let i=0;i<24;i+=4) {
    out.setUint32(motion.offset+i,archive.data.getUint32(motion.offset+i),true);
    if((i===0&&motion.nameAt!==null)||(i===12&&motion.script!==null))pointers.add(motion.offset+i);
  }
  for(const at of model.scripts.words.keys())out.setUint32(at,archive.data.getUint32(at),true);
  return {...model,pointerSlots:pointers,image:nativeSubgraphImage(data,pointers,new Map([[model.demo?'native_demo_motion_table':'native_motion_table',model.table]]))};
}
