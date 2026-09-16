import {inspectArchive} from './archive.mjs';

// Preserve HSD envelope order/weights. Single-weight and blended groups use
// different coordinate spaces in the original renderer; do not normalize them.
export function readSkinBindings(input,model) {
  const {data:d,relocations}=inspectArchive(input),nodes=model.tree.nodes;
  const byOffset=new Map(nodes.map((node,i)=>[node.offset,i]));
  function bounds(at,size){if(at%4||at<0||at+size>d.byteLength)throw Error('Invalid skin binding bounds');}
  function pointer(at){bounds(at,4);const value=d.getUint32(at);if(relocations.has(at))return value;
    if(value!==0)throw Error('Unrelocated skin pointer');return null;}
  const inverse=new Float32Array(nodes.length*12),hasInverse=new Uint32Array(nodes.length);
  nodes.forEach((node,i)=>{
    if(node.inverseBind===null)return;
    bounds(node.inverseBind,48);hasInverse[i]=1;
    for(let j=0;j<12;j++) {const value=d.getFloat32(node.inverseBind+j*4);
      if(!Number.isFinite(value))throw Error('Nonfinite inverse bind');inverse[i*12+j]=value;}
  });
  const groups=[],meshPalettes=[],influences=[],unique=new Map(),weightBits=new DataView(new ArrayBuffer(4));
  for(const mesh of model.meshes) {
    const type=mesh.flags&0x3000,palette=[];
    function add(kind,entries) {
      const key=kind+':'+mesh.joint+':'+entries.map(entry=>{
        weightBits.setFloat32(0,entry.weight);
        return entry.joint+','+weightBits.getUint32(0).toString(16);
      }).join(';');
      if(unique.has(key)){palette.push(unique.get(key));return;}
      const first=influences.length;influences.push(...entries);
      unique.set(key,groups.length);palette.push(groups.length);groups.push({kind,owner:mesh.joint,first,count:entries.length});
    }
    if(type===0) {
      add(0,[{joint:mesh.joint,weight:1}]);
      if(mesh.binding!==null) {
        const joint=byOffset.get(mesh.binding);if(joint===undefined)throw Error('Unknown shared mesh joint');
        add(0,[{joint,weight:1}]);
      }
    } else if(type===0x2000) {
      if(mesh.binding===null)throw Error('Missing envelope palette');
      let at=mesh.binding;
      for(let slot=0;;slot++,at+=4) {
        const entry=pointer(at);if(entry===null)break;
        if(slot>=10)throw Error('Envelope palette exceeds GX slots');
        const entries=[];
        for(let p=entry;;p+=8) {
          bounds(p,8);const target=pointer(p);if(target===null)break;
          const joint=byOffset.get(target),weight=d.getFloat32(p+4);
          if(joint===undefined||!Number.isFinite(weight)||weight<0||entries.length>=nodes.length)
            throw Error('Invalid envelope influence');
          entries.push({joint,weight});
        }
        if(!entries.length)throw Error('Empty envelope');add(1,entries);
      }
    } else throw Error('Shape deformation requires its own importer');
    for(const vertex of mesh.vertices) {
      const index=vertex[0]?.[0]??0;
      if(index%3||index/3>=palette.length)throw Error('Vertex references missing skin matrix');
    }
    meshPalettes.push(palette);
  }
  return {inverse,hasInverse,groups,influences,meshPalettes};
}

export function loadSkin(module,model,bindings,{referenceVertices=true}={}) {
  const owned=[];
  const alloc=bytes=>{const p=module._malloc(bytes);if(!p)throw Error('Skin allocation failed');owned.push(p);return p;};
  const upload=typed=>{const p=alloc(typed.byteLength);module.HEAPU8.set(new Uint8Array(typed.buffer,typed.byteOffset,typed.byteLength),p);return p;};
  try {
    const nodes=model.tree.nodes,n=nodes.length;
    const world=alloc(n*48),inverse=upload(bindings.inverse),has=upload(bindings.hasInverse),
      flags=upload(Uint32Array.from(nodes.map(n=>n.flags))),parents=upload(Int32Array.from(nodes.map(n=>n.parent)));
    const groups=upload(Uint32Array.from(bindings.groups.flatMap(g=>[g.kind,g.owner,g.first,g.count])));
    const inf=new ArrayBuffer(bindings.influences.length*8),iv=new DataView(inf);
    bindings.influences.forEach((x,i)=>{iv.setUint32(i*8,x.joint,true);iv.setFloat32(i*8+4,x.weight,true);});
    const influences=upload(new Uint8Array(inf)),matrices=alloc(bindings.groups.length*48);
    const positions=new Float32Array(model.totalVertices*3),indices=new Uint32Array(model.totalVertices);
    let vertex=0;
    model.meshes.forEach((mesh,i)=>mesh.vertices.forEach(v=>{
      positions.set([v[9][0],v[9][1],v[9][2]??0],vertex*3);
      indices[vertex++]=bindings.meshPalettes[i][(v[0]?.[0]??0)/3];
    }));
    const positionPtr=referenceVertices?upload(positions):0,indexPtr=referenceVertices?upload(indices):0,
      transformed=referenceVertices?alloc(positions.byteLength):0;
    return {world,matrices,transformed,positions,indices,bindings,groupCount:bindings.groups.length,
      step(){const result=module._portSkinMatrices(n,world,inverse,has,flags,parents,bindings.groups.length,groups,influences,matrices);
        if(result!==0)throw Error('Native skin matrices failed: '+result);
        if(referenceVertices)module._portSkinVertices(model.totalVertices,positionPtr,indexPtr,matrices,transformed);},
      dispose(){for(const p of owned)module._free(p);}};
  } catch(error){for(const p of owned)module._free(p);throw error;}
}
