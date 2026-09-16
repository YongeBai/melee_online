import {inspectArchive,nativeSubgraphImage} from './archive.mjs';
import {fighterArchives} from './fighter-assets.mjs';
import {convertFighterInitialization} from './fighter-init-assets.mjs';
import {convertFighterMotions} from './motion-assets.mjs';
import {convertSpecialAttributes} from './attribute-assets.mjs';
import {convertVisibility} from './visibility-assets.mjs';
import {convertSecondaryAnimations} from './secondary-animation-assets.mjs';
import {convertGameplayParameters,gameplayFields} from './gameplay-assets.mjs';
import {convertDynamics} from './dynamics-assets.mjs';
import {convertCharacterCollision} from './character-collision-assets.mjs';
import {convertAuxiliaryAsset} from './auxiliary-assets.mjs';
import {convertFighterArticles} from './article-assets.mjs';
import {convertFoxExtra} from './fox-extra-assets.mjs';

// Complete typed ftData graph for fighters without an x48 item/extra table,
// plus Fox/Falco's five-slot tables and Fox's separately typed extra record.
// Keep independently validated graphs separate initially. This deliberately
// duplicates unreachable source bytes; archive compaction is a later size task.
export function convertFighterBase(input,name,{motionSpec,attributeSpec,partCount,costumes}) {
  const code=/^Pl([A-Za-z]{2})\.dat$/.exec(name)?.[1],symbol=fighterArchives[code];
  if(!symbol)throw Error('Unknown complete fighter archive');
  const a=inspectArchive(input),source=a.publics.get('ftData'+symbol),d=a.data;
  if(source===undefined||source+96>a.dataSize||(!['Fc','Fx'].includes(code)&&(a.relocations.has(source+0x48)||d.getUint32(source+0x48))))throw Error('Unsupported complete fighter root');
  const chunks=[],pointers=new Set(),fields=new Array(24).fill(null),imports=[];let length=96;
  function append(bytes){const at=(length+3)&~3;chunks.push({at,bytes:Uint8Array.from(bytes)});length=at+bytes.length;return at;}
  function graph(image,label) {
    const v=new DataView(image.buffer,image.byteOffset,image.byteLength),size=v.getUint32(4,true),n=v.getUint32(8,true),pubs=v.getUint32(12,true);
    if(v.getUint32(0,true)!==image.length||v.getUint32(16,true)||32+size+n*4+pubs*8>image.length)throw Error('Invalid native base subgraph');
    const at=append(image.subarray(32,32+size)),body=chunks.at(-1).bytes,out=new DataView(body.buffer);
    for(let i=0;i<n;i++){const p=v.getUint32(32+size+i*4,true);if(p%4||p+4>size||out.getUint32(p,true)>=size)throw Error('Invalid native base pointer');out.setUint32(p,at+out.getUint32(p,true),true);pointers.add(at+p);}
    const symbols=Array.from({length:pubs},(_,i)=>at+v.getUint32(32+size+n*4+i*8,true));
    if(symbols.some(p=>p<at||p>=at+size))throw Error('Invalid native base symbol');
    imports.push({label,at,size,pointers:n});return {at,body,view:out,symbols};
  }
  function bind(offset,p){if(offset%4||offset<0||offset>=96||fields[offset/4]!==null)throw Error('Duplicate fighter field');fields[offset/4]=p;}
  const init=convertFighterInitialization(input,name,motionSpec),i=graph(init.image,'initialization');
  for(const [index,offset] of [0,0x40,0x50,0xC,0x10].entries())bind(offset,i.view.getUint32(init.root+index*4,true));
  const special=convertSpecialAttributes(input,name,attributeSpec);bind(4,append(special.bytes));
  bind(8,graph(convertVisibility(input,name,costumes).image,'visibility').symbols[0]);
  const demo=convertFighterMotions(input,name,motionSpec,{demo:true});bind(0x14,graph(demo.image,'demo motions').symbols[0]);
  if(!a.relocations.has(source+0x18))throw Error('Missing demo mapping');
  const mapping=d.getUint32(source+0x18);if(mapping+demo.count*2>a.dataSize)throw Error('Demo mapping bounds');
  for(const p of a.relocations)if(p>=mapping&&p<mapping+demo.count*2)throw Error('Pointer in packed demo mapping');
  bind(0x18,append(a.bytes.subarray(32+mapping,32+mapping+demo.count*2)));
  const secondary=graph(convertSecondaryAnimations(input,name,partCount).image,'secondary animations');bind(0x1C,secondary.symbols[0]);bind(0x20,secondary.symbols[1]);
  const game=convertGameplayParameters(input,name,partCount,init.count),g=graph(game.image,'gameplay parameters');
  for(const [index,offset] of gameplayFields.entries())bind(offset,g.view.getUint32(game.root+index*4,true)||null);
  bind(0x2C,graph(convertDynamics(input,name,partCount,motionSpec).image,'dynamics').symbols[0]);
  bind(0x30,graph(convertCharacterCollision(input,name,partCount).image,'hurtboxes').symbols[0]);
  bind(0x5C,graph(convertAuxiliaryAsset(input,name).image,'auxiliary model').symbols[0]);
  if(['Fc','Fx'].includes(code)) {
    if(!a.relocations.has(source+0x48))throw Error('Missing blaster fighter item table');
    const articles=convertFighterArticles(input,name),loaded=graph(articles.image,'articles'),extra=code==='Fx'?graph(convertFoxExtra(input,init.count).image,'Fox extra').symbols[0]:null;
    const table=d.getUint32(source+0x48),entries=new Uint8Array(20),v=new DataView(entries.buffer),start=append(entries);
    if(table+20>a.dataSize)throw Error('Blaster fighter item table bounds');
    for(let slot=0;slot<5;slot++) {
      const row=articles.rows.find(r=>r.slot===slot),at=table+slot*4;
      if(row){if(!a.relocations.has(at)||d.getUint32(at)!==row.article)throw Error('Blaster fighter article slot');v.setUint32(slot*4,loaded.at+row.article,true);pointers.add(start+slot*4);}
      else if(slot===4&&extra!==null){v.setUint32(slot*4,extra,true);pointers.add(start+slot*4);}
      else if(a.relocations.has(at)||d.getUint32(at))throw Error('Unconverted blaster fighter extra slot');
    }
    chunks.at(-1).bytes.set(entries);bind(0x48,start);
  }
  for(let index=0;index<24;index++)if(a.relocations.has(source+index*4)!==(fields[index]!==null)||(!a.relocations.has(source+index*4)&&d.getUint32(source+index*4)))throw Error('Incomplete fighter base field '+(index*4).toString(16));
  const bytes=new Uint8Array(length),out=new DataView(bytes.buffer);for(const c of chunks)bytes.set(c.bytes,c.at);
  fields.forEach((p,i)=>{if(p!==null){out.setUint32(i*4,p,true);pointers.add(i*4);}});
  return {kind:init.kind,root:0,fields,imports,motionCount:init.count,demoCount:demo.count,specialBytes:special.bytes.length,
    image:nativeSubgraphImage(bytes,pointers,new Map([['ftData'+symbol,0]]))};
}
