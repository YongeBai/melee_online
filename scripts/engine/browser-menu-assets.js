import {decodeGX} from './gx-decoder.js';

// These offsets describe USA 1.02 image headers, not copied game artwork.
const textures = [
  ['MnMaAll-f2c0.png','MnMaAll.usd',3292],
  ['MnMaAll-18580.png','MnMaAll.usd',81164],
  ['MnMaAll-1bf200.png','MnMaAll.usd',1824856],
  ['MnSlMap-860.png','MnSlMap.usd',446748],
];
export async function readLocalMenuAssets(file) {
  const read = async (offset,length) => {
    if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||length>32*1024*1024||offset+length>file.size)
      throw Error('Invalid menu data range in disc');
    const bytes=new Uint8Array(await file.slice(offset,offset+length).arrayBuffer());
    if(bytes.length!==length)throw Error('Truncated local disc');
    return bytes;
  };
  const view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
  const header=await read(0,0x440),h=view(header);
  if(new TextDecoder().decode(header.subarray(0,6))!=='GALE01'||header[6]!==0||header[7]!==2||h.getUint32(0x1c)!==0xc2339f3d)
    throw Error('Melee USA 1.02 ISO or GCM required');
  const fst=await read(h.getUint32(0x424),h.getUint32(0x428)),f=view(fst);
  if(fst.length<12||f.getUint32(0)!==0x01000000)throw Error('Invalid disc file table');
  const count=f.getUint32(8);
  if(count<1||count>100000||count*12>fst.length)throw Error('Invalid disc file count');
  const archives=new Map(),needed=new Set(textures.map(t=>t[1]));
  for(let i=1;i<count;i++) {
    const kind=f.getUint8(i*12),nameAt=count*12+(f.getUint32(i*12)&0xffffff),end=fst.indexOf(0,nameAt);
    if(kind>1||nameAt>=fst.length||end<nameAt||end-nameAt>255)throw Error('Invalid disc filename');
    const name=new TextDecoder().decode(fst.subarray(nameAt,end));
    if(kind===0&&needed.has(name)){
      if(archives.has(name))throw Error('Ambiguous menu archive');
      archives.set(name,await read(f.getUint32(i*12+4),f.getUint32(i*12+8)));
    }
  }
  const assets=new Map();
  for(const [name,archive,descriptor] of textures){
    const bytes=archives.get(archive);if(!bytes)throw Error('Missing menu archive: '+archive);
    const d=view(bytes),at=32+descriptor;
    if(at+24>bytes.length)throw Error('Truncated menu descriptor');
    const offset=32+d.getUint32(at),width=d.getUint16(at+4),height=d.getUint16(at+6),format=d.getUint32(at+8);
    if(offset>bytes.length)throw Error('Invalid menu image offset');
    assets.set(name,{width,height,rgba:decodeGX(bytes.subarray(offset),width,height,format)});
  }
  const dolOffset=h.getUint32(0x420),dol=view(await read(dolOffset,0x100));
  const readDol=async(address,length)=>{
    for(let i=0;i<18;i++){
      const offset=dol.getUint32(i*4),base=dol.getUint32(0x48+i*4),size=dol.getUint32(0x90+i*4);
      if(address>=base&&address+length<=base+size)return read(dolOffset+offset+address-base,length);
    }
    throw Error('Native font outside executable sections');
  };
  const sjis=view(await readDol(0x8040c8c0,0x240)),codes=view(await readDol(0x8040c680,0x240)),font=await readDol(0x8040cd40,287*512);
  for(const [name,text] of [['tap-jump','Tap jump'],['on','ON'],['off','OFF']]){
    const letters=[];
    for(const char of text){
      if(char===' '){letters.push({width:12});continue;}
      const ascii=char.charCodeAt(0),code=0x8200+ascii+(ascii>=97?0x20:0x1f);let glyph;
      for(let i=0;i<287;i++)if(sjis.getUint16(i*2)===code){glyph=codes.getUint16(i*2)-0x2000;break;}
      if(glyph===undefined||glyph<0||glyph>=287)throw Error('Unmapped native glyph');
      const rgba=decodeGX(font.subarray(glyph*512),32,32,0);let left=32,right=0;
      for(let y=0;y<32;y++)for(let x=0;x<32;x++)if(rgba[(y*32+x)*4+3]>20){left=Math.min(left,x);right=Math.max(right,x);}
      letters.push({rgba,left,width:right-left+2});
    }
    const width=letters.reduce((n,l)=>n+l.width,0),rgba=new Uint8Array(width*32*4);let x=0;
    for(const l of letters){if(l.rgba)for(let y=0;y<32;y++)for(let xx=0;xx<l.width-1;xx++)rgba.set([255,255,255,l.rgba[(y*32+xx+l.left)*4+3]],(y*width+x+xx)*4);x+=l.width;}
    assets.set(name+'.png',{width,height:32,rgba});
  }
  return assets;
}

let objectUrls=[];
export async function installLocalMenuAssets(file){
  const assets=await readLocalMenuAssets(file),urls=new Map();
  try{
    for(const [name,{width,height,rgba}] of assets){
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba),width,height),0,0);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve));if(!blob)throw Error('Could not decode menu artwork');
      urls.set(name,URL.createObjectURL(blob));
    }
    for(const [name,url] of urls){
      document.documentElement.style.setProperty('--disc-'+name.replace('.png',''),`url("${url}")`);
      for(const img of document.querySelectorAll('img[data-disc-asset]'))if(img.dataset.discAsset===name)img.src=url;
    }
    for(const url of objectUrls)URL.revokeObjectURL(url);objectUrls=[...urls.values()];
  }catch(error){for(const url of urls.values())URL.revokeObjectURL(url);throw error;}
}
