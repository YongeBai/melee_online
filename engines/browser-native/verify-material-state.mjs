// Independent descriptor/default expectations for the original HSD setup.
export function verifyNativePixel(source,pixel) {
  const p=source.pixelEngine,flags=source.renderMode>>>0;
  const bit=(value,mask)=>(value&mask)?1:0;
  const expected=p?{
    blend:{type:p[4],source:p[5],destination:p[6],logic:p[7]},
    depth:{enabled:bit(p[0],16),compare:p[8],update:bit(p[0],32),beforeTexture:bit(p[0],8)},
    colorUpdate:bit(p[0],1),alphaUpdate:bit(p[0],2),destinationAlpha:{enabled:bit(p[0],4),alpha:p[3]},dither:bit(p[0],64),
    alphaTest:{compare0:p[9],reference0:p[1],operation:p[10],compare1:p[11],reference1:p[2]}
  }:{
    blend:{type:bit(flags,0x40000000),source:4,destination:5,logic:15},
    depth:{enabled:1,compare:flags&0x08000000?7:3,update:flags&0x20000000?0:1,beforeTexture:!(flags&0x20000000)&&(flags&0x40000000)?0:1},
    colorUpdate:1,alphaUpdate:0,destinationAlpha:{enabled:0,alpha:0},dither:0,
    alphaTest:{compare0:!(flags&0x20000000)&&(flags&0x40000000)?4:7,reference0:0,operation:0,compare1:!(flags&0x20000000)&&(flags&0x40000000)?4:7,reference1:0}
  };
  for(const key of Object.keys(expected))if(JSON.stringify(expected[key])!==JSON.stringify(pixel[key]))throw Error('Native/source pixel state: '+key);
  if(pixel.channelCount!==((flags&8)?2:1)||!pixel.channels[0]||!pixel.channels[2])throw Error('Native material channel setup');
}
