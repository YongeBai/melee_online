import {readAnimationObject} from './animation-object-assets.mjs';
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
      const animation=readAnimationObject(archive,aobj,index);
      for(const at of animation.pointers)pointers.add(at);
      for(const at of animation.words)words.add(at);
      node.animation=animation;
    }
    visit(child,index);active.delete(at);visit(next,parent);
  }
  visit(root,-1);return {root,nodes,pointers,words};
}
