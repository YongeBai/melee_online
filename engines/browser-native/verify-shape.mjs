import {readShapeSet} from './shape-assets.mjs';
// Independent big-endian source oracle; original C owns animation/interpolation.
export function verifyShapeSamples(module,archive,mesh,polygon,positions,count,normals,normalCount){
 const shape=readShapeSet(archive,mesh.binding),d=archive.data,F=Math.fround,additive=!!(shape.flags&2);
 const blends=Array.from({length:additive?shape.count:1},(_,i)=>module._portShapeBlend(polygon,i));let checks=0;
 for(const row of shape.rows){
  const n=row.attribute===9?count:normalCount,p=row.attribute===9?positions:normals;
  if(n!==row.vertices)throw Error('Native shape sample count differs from source');
  const actual=new Float32Array(module.HEAPU8.buffer,p,n*3),width=[1,1,2,2,4][row.type],get=['getUint8','getInt8','getUint16','getInt16','getFloat32'][row.type];
  const sample=(s,i,c)=>F(d[get](row.data+row.indices[s][i]*row.stride+c*width)/(row.type===4?1:2**row.frac));
  for(let i=0;i<n;i++)for(let c=0;c<3;c++){
   let value;
   if(additive){value=sample(0,i,c);for(let s=0;s<shape.count;s++)value=F(value+F(sample(s+1,i,c)*Math.max(0,blends[s])));}
   else{const s=Math.min(Math.max(0,Math.trunc(blends[0])),shape.count-1),b=Math.min(Math.max(0,F(blends[0]-s)),1),a=sample(s,i,c),z=sample(Math.min(s+1,shape.count-1),i,c);value=F(F(F(z-a)*b)+a);}
   if(actual[i*3+c]!==value)throw Error('Original HSD shape differs from source reference '+JSON.stringify({attribute:row.attribute,i,c,actual:actual[i*3+c],expected:value,blends}));checks++;
  }
 }
 return {checks,blends};
}
