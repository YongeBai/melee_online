import {convertFighterArticles} from './article-assets.mjs';
import {convertItemCommon} from './item-common-assets.mjs';
import {inspectArchive} from './archive.mjs';
import {installResidentFile,openResidentArchive} from './resident-files.mjs';

export function verifyItemCommon(module,bytes) {
  const source=convertItemCommon(bytes),original=inspectArchive(bytes);let checks=0;
  const check=(ok,message)=>{checks++;if(!ok)throw Error('Native common items: '+message);};
  installResidentFile(module,'NativeItemCommon.dat',source.image);
  const file=openResidentArchive(module,'NativeItemCommon.dat',['native_item_common','native_item_parameters']);
  try {
    const [common,parameters]=file.addresses,base=common-source.common,view=new DataView(module.HEAPU8.buffer);
    check(parameters===base+source.parameters,'parameter location');
    for(const at of source.words)check(view.getUint32(base+at,true)===original.data.getUint32(at),'numeric word');
    for(const at of source.packed)check(view.getUint8(base+at)===original.data.getUint8(at),'packed byte');
    const result=module._portItemCommonProbe(common),expected=new Map([
      [4,0],[12,4],[20,8],[32,12],[40,16],[48,20],[56,24],[68,28],[76,36],[84,32],[92,40],[100,0x148],
    ]);
    for(let at=0;at<104;at+=4)check(view.getUint32(result+at,true)===(expected.has(at)?original.data.getUint32(source.common+expected.get(at)):0),'original item limit/count initialization');
    for(const [i,value] of [1,0xffffffff,0xffffffff,0].entries())check(view.getUint32(result+104+i*4,true)===value,'original tracking initialization');
    return {passed:true,checks,numericWords:source.words.length,packedBytes:source.packed.length,originalInitialization:'Item_80266FCC',limitation:'Common parameter conversion and original pool/count initialization only. Article registries, color tables and match spawning are not installed.'};
  } finally {file.dispose();}
}

// Independent numeric-word oracle for the commands actually used by these
// laser/illusion archives. It does not replace the game's command interpreter.
function scriptReference(data,start,scale) {
  let pc=start,timer=0;
  const hits=Array.from({length:4},()=>Array(11).fill(0)),f=Math.fround,unit=f(.003906);
  const signed16=n=>n<32768?n:n-65536;
  return {hits,get pc(){return pc;},get timer(){return timer;},step(){
    if(pc===null)return;timer=f(timer-1);
    for(let limit=0;pc!==null&&timer<=0;limit++) {
      if(limit>256)throw Error('Article reference command budget');
      const word=data.getUint32(pc),op=word>>>26;pc+=4;
      if(op===0)pc=null;
      else if(op===1)timer=f(timer+(word&0x3ffffff));
      else if(op===11) {
        const id=(word>>>23)&7;if(id>=4)throw Error('Article reference hitbox id');
        const a=data.getUint32(pc),b=data.getUint32(pc+4),c=data.getUint32(pc+8),d=data.getUint32(pc+12);
        hits[id]=[1,word&8191,f(f(unit*(a>>>16))*f(1/scale)),f(unit*signed16(a&65535)),
          f(unit*signed16(b>>>16)),f(unit*signed16(b&65535)),c>>>23,(c>>>14)&511,(c>>>5)&511,d>>>23,(d>>>18)&31];pc+=20;
      } else if(op===12)hits[(word>>>23)&7][1]=word&8191;
      else if(op===14){
        hits[word&0x3ffffff][0]=0;
        // Original disable-one also refreshes every remaining hit capsule's
        // world position, advancing its freshly-enabled/moving state.
        for(const h of hits)if(h[0]===1||h[0]===2)h[0]++;
      }
      else if(op===15)for(const hit of hits)hit[0]=0;
      else throw Error('Article reference opcode requires implementation: '+op);
    }
  }};
}

export function verifyArticles(module,fixtures) {
  let checks=0,scriptFrames=0;const rows=[];
  const check=(ok,message)=>{checks++;if(!ok)throw Error('Native articles: '+message);};
  const baseline={objects:module._portSceneLiveObjects(),models:module._portOriginalItemModelLive(),files:module._portFileAllocations()};
  for(const {name,bytes} of fixtures) {
    const source=convertFighterArticles(bytes,name),original=inspectArchive(bytes),native=new DataView(source.image.buffer,32);
    const filename=name.replace('.dat','Articles.dat');installResidentFile(module,filename,source.image);
    const articles=[];
    for(const row of source.rows) {
      const file=openResidentArchive(module,filename,['native_article_'+row.slot]),article=file.addresses[0],base=article-row.article;
      const view=new DataView(module.HEAPU8.buffer);
      try {
        for(const p of source.pointerSlots)check(view.getUint32(base+p,true)===base+native.getUint32(p,true),'original archive relocation');
        for(let i=0;i<row.specialWords;i++)check(Object.is(view.getFloat32(base+row.special+i*4,true),original.data.getFloat32(row.special+i*4)),'special attribute');
        for(const at of row.script.words.keys())if(!row.script.pointers.has(at))check(view.getUint32(base+at,true)===original.data.getUint32(at),'native script word');
        let activeFrames=0;const states=[];
        for(let state=0;state<row.stateCount;state++) {
          const object=module._portArticleProbeCreate(article);check(object,'native article model owner');
          const p=row.states+state*16+12,start=original.relocations.has(p)?original.data.getUint32(p):null;
          const reference=scriptReference(original.data,start,original.data.getFloat32(row.attributes+0x60));let active=0;
          try {
            module._portArticleProbeStart(object,state,row.stateCount);
            for(let frame=0;frame<64;frame++) {
              reference.step();module._portArticleProbeStep(object,frame);scriptFrames++;
              check(module._portArticleProbeRead(object,0,0)===(reference.pc===null?0:base+reference.pc),'script cursor');
              check(module._portArticleProbeRead(object,1,0)===reference.timer,'script timer');
              for(let hit=0;hit<4;hit++)for(let field=0;field<11;field++) {
                const expected=reference.hits[hit][field],actual=module._portArticleProbeRead(object,field+2,hit);
                check(Number.isFinite(actual)&&Math.abs(actual-expected)<=1e-6*(1+Math.abs(expected)),`hitbox ${hit} field ${field} state ${state} frame ${frame}: ${actual} != ${expected}`);
              }
              if(reference.hits.some(h=>h[0]))active++;
            }
          } finally {module._portSceneObjectFree(object);}
          states.push({state,activeFrames:active,scriptCommands:start===null?0:row.script.commands.size});activeFrames+=active;
        }
        articles.push({slot:row.slot,states:row.stateCount,commands:row.script.commands.size,activeFrames,stateChecks:states});
      } finally {file.dispose();}
    }
    rows.push({name,articles});
  }
  check(module._portSceneLiveObjects()===baseline.objects&&module._portOriginalItemModelLive()===baseline.models,'article owner teardown');
  check(module._portFileAllocations()===baseline.files,'article archive release');
  return {passed:true,checks,scriptFrames,rows,limitation:'Original article model setup and hitbox command handlers in isolated owners. Full item spawning, movement, fighter ownership, collision scheduling and match integration remain.'};
}
