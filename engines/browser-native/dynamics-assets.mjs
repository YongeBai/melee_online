import {inspectArchive,nativeSubgraphImage} from './archive.mjs';
import {fighterArchives} from './fighter-assets.mjs';
import {convertCharacterCollision} from './character-collision-assets.mjs';

// ftDynamics contains pointer tables of INTEGER cutoffs, not FigaTree objects.
// The on-disc parameter arrays are 60-byte float records, not runtime nodes.
export function convertDynamics(input,name,partCount,spec) {
  const archive=inspectArchive(input),d=archive.data,code=name.slice(2,4),kind=spec.codes.indexOf(code);
  const root=archive.publics.get('ftData'+fighterArchives[code]);
  if(root===undefined||kind<0||!Number.isInteger(spec.counts[kind]))throw Error('Invalid dynamics fighter');
  const collision=convertCharacterCollision(input,name,partCount),chunks=[],pointers=new Set(),ranges=[];let length=20;
  function bounds(at,size){if(!Number.isInteger(at)||at<0||at%4||at+size>d.byteLength)throw Error('Dynamics range');}
  function word(at){bounds(at,4);return d.getUint32(at);}
  function pointer(at){const value=word(at);if(!archive.relocations.has(at)){if(value)throw Error('Unrelocated dynamics pointer');return null;}bounds(value,4);return value;}
  function claim(at,size,type){bounds(at,size);for(const r of ranges)if(at<r.at+r.size&&r.at<at+size){if(at===r.at&&size===r.size&&type===r.type)return;throw Error('Overlapping dynamics types');}ranges.push({at,size,type});}
  function scalar(at,float=false){if(archive.relocations.has(at))throw Error('Pointer in dynamics scalar');const value=float?d.getFloat32(at):word(at);if(!Number.isFinite(value))throw Error('Nonfinite dynamics parameter');return value;}
  function alloc(size){const at=length;length+=size;const bytes=new Uint8Array(size);chunks.push({at,bytes});return {at,view:new DataView(bytes.buffer)};}
  const dyn=pointer(root+0x2c);if(dyn===null)throw Error('Missing dynamics root');claim(dyn,20,'root');
  const count=scalar(dyn),bones=pointer(dyn+4),table=pointer(dyn+16);
  if(count>=10||(count&&bones===null))throw Error('Invalid dynamics count');
  // Purin also has four descriptors for optional hats. Import them, but only
  // validate base-model bone indices for the descriptors used by normal setup.
  const descriptors=count?(code==='Pr'?5:count):0,rows=[],parameters=new Map(),dst=alloc(descriptors*24);
  if(descriptors)claim(bones,descriptors*24,'descriptors');
  for(let i=0;i<descriptors;i++) {
    const at=bones+i*24,bone=scalar(at),source=pointer(at+4),nodes=scalar(at+8),pos=[12,16,20].map(o=>scalar(at+o,true));
    if(nodes>140||!nodes||source===null||(i<count&&(bone>=partCount||bone+nodes>partCount)))throw Error('Invalid dynamic bone chain');
    claim(source,nodes*60,'parameters');
    let params=parameters.get(source);
    if(!params){const allocation=alloc(nodes*60),values=[];for(let j=0;j<nodes*15;j++){values.push(scalar(source+j*4,true));allocation.view.setUint32(j*4,word(source+j*4),true);}params={...allocation,values};parameters.set(source,params);}
    dst.view.setUint32(i*24,bone,true);dst.view.setUint32(i*24+4,params.at,true);pointers.add(dst.at+i*24+4);dst.view.setUint32(i*24+8,nodes,true);
    for(let j=0;j<3;j++)dst.view.setFloat32(i*24+12+j*4,pos[j],true);
    rows.push({bone,count:nodes,pos,parameters:params.values,parameterOffset:params.at});
  }
  const colliders=alloc(collision.dynamicColliders.length*20);
  collision.dynamicColliders.forEach((row,i)=>row.forEach((v,j)=>j?colliders.view.setFloat32(i*20+j*4,v,true):colliders.view.setUint32(i*20,v,true)));
  const mapping=pointer(root+16),motionCount=spec.counts[kind];
  if(mapping===null||mapping+motionCount*2>d.byteLength)throw Error('Dynamics animation mapping');
  const selectors=[],cutoffArrays=new Map();let selectorTable=null;
  if(count&&table!==null) {
    const max=Math.max(...Array.from({length:motionCount},(_,i)=>d.getUint8(mapping+i*2+1)));
    claim(table,(max+1)*4,'selector table');selectorTable=alloc((max+1)*4);
    for(let i=0;i<=max;i++) {
      const row=pointer(table+i*4);if(row===null){selectors.push(null);continue;}
      claim(row,count*4,'cutoffs');
      let cutoffs=cutoffArrays.get(row);
      if(!cutoffs){cutoffs={...alloc(count*4),values:[]};for(let j=0;j<count;j++){const value=scalar(row+j*4);if(value>256)throw Error('Invalid dynamics cutoff');cutoffs.values.push(value);cutoffs.view.setUint32(j*4,value,true);}cutoffArrays.set(row,cutoffs);}
      const values=cutoffs.values;
      selectorTable.view.setUint32(i*4,cutoffs.at,true);pointers.add(selectorTable.at+i*4);selectors.push(values);
    }
  }
  const bytes=new Uint8Array(length),out=new DataView(bytes.buffer);chunks.forEach(c=>bytes.set(c.bytes,c.at));
  out.setUint32(0,count,true);if(count){out.setUint32(4,dst.at,true);pointers.add(4);}
  out.setUint32(8,collision.dynamicColliders.length,true);if(collision.dynamicColliders.length){out.setUint32(12,colliders.at,true);pointers.add(12);}
  if(selectorTable){out.setUint32(16,selectorTable.at,true);pointers.add(16);}
  return {kind,count,rows,selectors,partCount,colliders:collision.dynamicColliders,
    image:nativeSubgraphImage(bytes,pointers,new Map([['native_fighter_dynamics',0]]))};
}
