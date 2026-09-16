import {inspectArchive} from './archive.mjs';

// Decode only typed HSD_Joint descriptors. Meshes, materials, constraints and
// inverse-bind matrices keep their archive offsets for later typed import.
export function readJointTree(input) {
  const archive=inspectArchive(input),d=archive.data;
  const roots=[...archive.publics].filter(([name])=>name.endsWith('_Share_joint'));
  if(roots.length!==1)throw Error('Expected one fighter joint root');
  const [name,root]=roots[0],nodes=[],offsets=new Map(),active=new Set();
  function pointer(slot) {
    const value=d.getUint32(slot);
    if(archive.relocations.has(slot))return value;
    if(value!==0)throw Error('Unrelocated joint pointer');
    return null;
  }
  function visit(at,parent) {
    if(at===null)return -1;
    if(at%4||at+64>d.byteLength||active.has(at))throw Error('Invalid or cyclic joint tree');
    if(offsets.has(at))throw Error('Shared joint instances need explicit ownership');
    if(nodes.length>=4096)throw Error('Joint tree exceeds supported capacity');
    const index=nodes.length,flags=d.getUint32(at+4);
    const values=Array.from({length:9},(_,i)=>d.getFloat32(at+20+i*4));
    if(values.some(x=>!Number.isFinite(x)))throw Error('Nonfinite joint transform');
    const node={offset:at,parent,flags,className:pointer(at),rotation:values.slice(0,3),
      scale:values.slice(3,6),translation:values.slice(6),display:pointer(at+16),
      inverseBind:pointer(at+56),constraints:pointer(at+60),child:-1,next:-1};
    nodes.push(node);offsets.set(at,index);active.add(at);
    // INSTANCE owns no child. HSD resolves this descriptor through its ID table
    // after loading the owning tree; it must not consume an animation slot.
    if(flags&0x1000)node.instanceOffset=pointer(at+8);
    else node.child=visit(pointer(at+8),index);
    node.next=visit(pointer(at+12),parent);
    active.delete(at);
    return index;
  }
  visit(root,-1);
  for(const node of nodes)if(node.flags&0x1000){
    if(!offsets.has(node.instanceOffset))throw Error('Joint instance target must belong to the owning tree');
    node.instanceTarget=offsets.get(node.instanceOffset);
  }
  // Owned links are acyclic above. References can still create a display loop;
  // follow the same edges as HSD_JObjDispAll (an instance excludes target.next).
  const displaying=new Set(),finished=new Set();
  function display(index){
    if(displaying.has(index))throw Error('Cyclic joint instance display');
    if(finished.has(index))return;
    displaying.add(index);const node=nodes[index];
    if(node.flags&0x1000)display(node.instanceTarget);
    else for(let child=node.child;child!==-1;child=nodes[child].next)display(child);
    displaying.delete(index);finished.add(index);
  }
  for(let i=0;i<nodes.length;i++)display(i);
  // Keep the complete depth-first node order for FigaTree indexing. Skeleton
  // flags identify bone joints, but unflagged nodes still occupy track slots.
  const skeleton=nodes.map((node,index)=>({node,index})).filter(({node})=>node.flags&1).map(({index})=>index);
  return {name,nodes,skeleton};
}
