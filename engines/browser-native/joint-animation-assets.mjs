import {validateTrack} from './animation-assets.mjs';
// HSD_AnimJoint/HSD_AObjDesc/HSD_FObjDesc; payloads are byte-coded LE.
export function readJointAnimation(archive,root) {
  const d=archive.data,pointers=new Set(),words=new Set(),nodes=[],seen=new Set(),active=new Set();
  const bounds=(at,size)=>{if(at%4||at<0||at+size>d.byteLength)throw Error('Joint animation descriptor out of bounds');};
  function word(at){bounds(at,4);words.add(at);return d.getUint32(at);}
  function ptr(at){const v=word(at);if(!archive.relocations.has(at)){if(v)throw Error('Unrelocated joint animation pointer');return null;}pointers.add(at);return v;}
  function visit(at,parent) {
    if(at===null)return;
    bounds(at,20);if(active.has(at)||seen.has(at)||nodes.length>=4096)throw Error('Cyclic/shared animation-joint node');
    active.add(at);seen.add(at);const index=nodes.length,child=ptr(at),next=ptr(at+4),aobj=ptr(at+8),robj=ptr(at+12),flags=word(at+16);
    if(robj!==null)throw Error('Constraint animation needs explicit integration');
    const node={offset:at,parent,flags,animation:null};nodes.push(node);
    if(aobj!==null) {
      bounds(aobj,16);const flags=word(aobj),end=d.getFloat32(aobj+4);word(aobj+4);
      let track=ptr(aobj+8);const object=ptr(aobj+12);
      if(object!==null)throw Error('Animation object references need explicit ownership');
      if(!Number.isFinite(end)||end<0)throw Error('Invalid animation duration');
      const tracks=[],visited=new Set();
      for(;track!==null;) {
        bounds(track,20);if(visited.has(track))throw Error('Cyclic FObj descriptor');visited.add(track);
        const next=ptr(track),length=word(track+4),start=d.getFloat32(track+8);word(track+8);
        const objType=d.getUint8(track+12),fracValue=d.getUint8(track+13),fracSlope=d.getUint8(track+14),data=ptr(track+16);
        if(!length||data===null||data+length>d.byteLength||!Number.isFinite(start)||start<-32768||start>32767)throw Error('Invalid joint animation track');
        const bytes=Uint8Array.from(archive.bytes.subarray(32+data,32+data+length));validateTrack(bytes,fracValue,fracSlope);
        tracks.push({bone:index,start,objType,fracValue,fracSlope,bytes});track=next;
      }
      node.animation={flags,end,tracks};
    }
    visit(child,index);active.delete(at);visit(next,parent);
  }
  visit(root,-1);return {root,nodes,pointers,words};
}
