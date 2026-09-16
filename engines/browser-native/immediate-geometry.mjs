// Preserve GX primitive winding when expressing immediate geometry as triangles.
export function immediateTriangles(primitive,count) {
  if(!Number.isInteger(count)||count<1||count>4096)throw Error('Immediate vertex capacity');
  const out=[];
  if(primitive===0x80){if(count%4)throw Error('Incomplete GX quad');for(let i=0;i<count;i+=4)out.push(i,i+1,i+2,i,i+2,i+3);}
  else if(primitive===0x90){if(count%3)throw Error('Incomplete GX triangle');for(let i=0;i<count;i++)out.push(i);}
  else if(primitive===0x98){if(count<3)throw Error('Incomplete GX strip');for(let i=2;i<count;i++)out.push(i%2?i-1:i-2,i%2?i-2:i-1,i);}
  else if(primitive===0xa0){if(count<3)throw Error('Incomplete GX fan');for(let i=2;i<count;i++)out.push(0,i-1,i);}
  else throw Error('Unsupported immediate primitive '+primitive);
  return Uint32Array.from(out);
}
