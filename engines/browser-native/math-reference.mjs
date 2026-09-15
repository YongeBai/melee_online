// Independent finite IEEE binary32 FMA oracle. BigInt computes the exact
// product-plus-sum before a single ties-to-even rounding step.
const bits=new DataView(new ArrayBuffer(4));
function decode(value) {
  bits.setFloat32(0,value);const u=bits.getUint32(0),e=(u>>>23)&255;
  if(e===255)throw Error('FMA oracle requires finite inputs');
  return {m:BigInt((u&0x7fffff)|(e?0x800000:0))*(u>>>31?-1n:1n),
    e:e?e-150:-149,negative:!!(u>>>31)};
}
export function referenceFma(a,b,c) {
  const x=decode(a),y=decode(b),z=decode(c),pe=x.e+y.e,base=Math.min(pe,z.e);
  let n=(x.m*y.m<<BigInt(pe-base))+(z.m<<BigInt(z.e-base));
  if(n===0n)return (x.m*y.m===0n && z.m===0n && (x.negative!==y.negative) && z.negative)?-0:0;
  const negative=n<0n;if(negative)n=-n;
  const highest=base+n.toString(2).length-1;
  const lsb=Math.max(highest-23,-149),shift=lsb-base;
  if(shift>0) {
    const s=BigInt(shift),q=n>>s,rem=n-(q<<s),half=1n<<(s-1n);
    n=q+(rem>half||(rem===half&&(q&1n))?1n:0n);
  } else n<<=BigInt(-shift);
  return Math.fround(Number(n)*2**lsb)*(negative?-1:1);
}
