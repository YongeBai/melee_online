// USA 1.02 private cosmetic experiment. Select the game's existing low-detail
// mesh visibility table for the normal render group. Keep the normal render
// callback, skeleton, animation processes and all gameplay/camera fields.
export function planFighterModelDetail(read32, read8, highDetail) {
  if (typeof highDetail !== 'boolean') throw Error('Model detail must be boolean');
  const valid=(p,n,align=4)=>Number.isInteger(p)&&p%align===0&&p>=0x80003100&&p+n<=0x81800000;
  const check=(p,n,label,align=4)=>{if(!valid(p,n,align))throw Error('Invalid '+label);return p;};
  const lists=check(read32(0x804d782c),0x24,'fighter list');
  const seen=new Set(),objects=[],writes=[],byteWrites=[];let g=read32(lists+0x20);
  while(g){
    check(g,0x38,'fighter object');if(seen.has(g)||seen.size>=16)throw Error('Invalid fighter chain');seen.add(g);
    const fp=check(read32(g+0x2c),0x620,'fighter data');
    if(read8(g)!==0||read8(g+1)!==4||read8(g+2)!==8||read32(fp)!==g)throw Error('Unrecognized fighter ownership');
    const data=check(read32(fp+0x10c),12,'fighter definition');
    const desc=check(read32(data+8),8,'model descriptor');
    const count=read32(fp+0x5ac),costume=read8(fp+0x619);
    if(count!==read32(desc)||count>11||costume>7)throw Error('Unrecognized model or costume count');
    if(count===0){g=read32(g+8);continue;}
    const table=check(read32(desc+4),(costume+1)*16,'costume visibility table');
    const high=read32(table+costume*16)||read32(table);
    const low=read32(table+costume*16+4)||read32(table+4);
    if(!high||!low){g=read32(g+8);continue;}
    const current=read32(fp+0x5b8),currentLow=read32(fp+0x5bc);
    if(![high,low].includes(current)||currentLow!==low)throw Error('Unrecognized live model tables');
    const dobjCount=read32(fp+0x5ec),dobjTable=read32(fp+0x5f0);
    if(!dobjCount||dobjCount>256)throw Error('Invalid mesh count');check(dobjTable,dobjCount*4,'mesh pointer table');
    const collect=lookup=>{
      check(lookup,count*8,'model visibility groups');const meshes=new Set();
      for(let model=0;model<count;model++){
        const variants=read32(lookup+model*8),entries=read32(lookup+model*8+4);
        if(variants>256)throw Error('Invalid model variant count');
        if(variants)check(entries,variants*8,'model variants');
        for(let variant=0;variant<variants;variant++){
          const n=read32(entries+variant*8),indices=read32(entries+variant*8+4);
          if(n>256)throw Error('Invalid variant mesh count');if(n)check(indices,n,'mesh indices',1);
          for(let i=0;i<n;i++){
            const index=read8(indices+i);if(index>=dobjCount)throw Error('Out-of-range mesh index');
            meshes.add(check(read32(dobjTable+index*4),0x18,'mesh'));
          }
        }
      }
      return meshes;
    };
    const highMeshes=collect(high),lowMeshes=collect(low),target=highDetail?high:low;
    if(!highMeshes.size||!lowMeshes.size)throw Error('Model table has no drawable meshes');
    objects.push({gobj:g,fighter:fp,kind:read32(fp+4),costume,highMeshes:highMeshes.size,lowMeshes:lowMeshes.size,high,low,selected:target});
    if(current!==target){
      // Hide both groups once; normal Melee rendering selects the live part
      // variants on its next draw. This does not rewrite the archive tables.
      for(const mesh of new Set([...highMeshes,...lowMeshes])){
        const flags=read32(mesh+0x14);if(!(flags&1))writes.push([mesh+0x14,(flags|1)>>>0]);
      }
      writes.push([fp+0x5b8,target]);byteWrites.push([fp+0x5b0,0]);
    }
    g=read32(g+8);
  }
  return {objects,writes,byteWrites};
}
