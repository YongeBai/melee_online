// Independent byte/word reference for the color state machine. All reads are
// from the original BE archive; no native struct offsets or bitfields are used.
const f=Math.fround,rgba=w=>[w>>>24,(w>>>16)&255,(w>>>8)&255,w&255];
const signed=(w,bits)=>{const v=w&(2**bits-1);return v>=2**(bits-1)?v-2**bits:v;};
export function createColorReference(archive,table,index) {
  const d=archive.data,s={timer:0,lifetime:0,pc:null,stack:[],index:0,color:[0,0,0,0],light:[0,0,0,0],
    colorValue:[0,0,0,0],colorDelta:[0,0,0,0],lightValue:[0,0,0,0],lightDelta:[0,0,0,0],rotation:[0,0],
    enabled:false,lightActive:false,lightEnabled:false,events:[0,0,0],hash:2166136261};
  function select(index,lifetime=0) {
    if(table.entries[s.index].priority>table.entries[index].priority)return false;
    Object.assign(s,{pc:table.entries[index].script,index,lifetime,timer:0,stack:[],enabled:false,lightActive:false});return true;
  }
  select(index);
  function step() {
    if(s.pc!==null&&s.timer!==0)s.timer--;
    let iterations=0;
    while(s.pc!==null&&s.timer===0) {
      if(++iterations>10000)throw Error('Color reference did not yield');
      const at=s.pc,w=d.getUint32(at),op=w>>>26,value=w&0x3ffffff;
      switch(op) {
      case 0:s.pc=null;break;
      case 3:s.stack.push(at+4,value);s.pc+=4;break;
      case 4: {
        const last=s.stack.length-1;if(last<1)throw Error('Color loop stack underflow');
        s.stack[last]=(s.stack[last]-1)>>>0;
        if(s.stack[last])s.pc=s.stack[last-1];else {s.stack.length-=2;s.pc+=4;}break;
      }
      case 5:s.stack.push(at+8);s.pc=archive.relocations.has(at+4)?d.getUint32(at+4):null;break;
      case 6:if(!s.stack.length)throw Error('Color return stack underflow');s.pc=s.stack.pop();break;
      case 7:s.pc=archive.relocations.has(at+4)?d.getUint32(at+4):null;break;
      case 10:return true;
      case 11:s.timer=(s.timer+value)|0;s.pc+=4;break;
      case 12:s.enabled=false;s.lightActive=false;s.pc+=4;break;
      case 13:
        s.lightEnabled=Boolean((w>>>25)&1);s.rotation=[signed(w>>>12,12),signed(w,12)];
        s.light=rgba(d.getUint32(at+4));s.lightValue=[...s.light];s.lightDelta.fill(0);s.lightActive=true;s.pc+=8;break;
      case 14:s.light=rgba(d.getUint32(at+4));s.lightValue=[...s.light];s.lightDelta.fill(0);s.pc+=8;break;
      case 15:case 19: {
        const target=rgba(d.getUint32(at+4)),light=op===15,current=light?s.light:s.color;
        const delta=target.map((v,i)=>f(f(f(0.5+v)-current[i])/f(value)));
        if(light)s.lightDelta=delta;else s.colorDelta=delta;s.pc+=8;break;
      }
      case 16:s.rotation=[signed(w>>>13,13),signed(w,13)];s.pc+=4;break;
      case 17:s.lightActive=false;s.pc+=4;break;
      case 18:s.enabled=true;s.color=rgba(d.getUint32(at+4));s.colorValue=[...s.color];s.colorDelta.fill(0);s.pc+=8;break;
      case 20:s.enabled=false;s.pc+=4;break;
      case 21:case 22:case 23: {
        const n=[5,3,1][op-21];s.events[op-21]++;
        for(let i=0;i<n;i++)s.hash=Math.imul(s.hash^d.getUint32(at+i*4),16777619)>>>0;
        s.pc+=n*4;break;
      }
      default:throw Error('Unsupported color reference opcode '+op);
      }
      if(s.stack.length>5)throw Error('Color return stack exceeded original capacity');
    }
    for(const light of [false,true])if(light?s.lightActive:s.enabled) {
      const values=light?s.lightValue:s.colorValue,delta=light?s.lightDelta:s.colorDelta,bytes=light?s.light:s.color;
      for(let i=0;i<4;i++){values[i]=f(values[i]+delta[i]);bytes[i]=Math.trunc(values[i])&255;}
    }
    if(s.lifetime!==0&&--s.lifetime===0)return true;
    return false;
  }
  function values(base) {
    return [s.timer,s.lifetime,s.pc===null?0:base+s.pc,s.stack.length,s.index,...s.color,...s.light,
      ...s.colorValue,...s.colorDelta,...s.lightValue,...s.lightDelta,...s.rotation,
      +s.enabled,+s.lightActive,+s.lightEnabled,...s.events,s.hash];
  }
  return {state:s,select,step,values};
}
