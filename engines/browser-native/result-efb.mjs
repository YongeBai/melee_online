import {encodeGX,textureByteLength} from './texture.mjs';

// GX copy coordinates use the 640x480 EFB with a top-left origin. The browser
// result probe renders that same picture into a 960x720 framebuffer, so sample
// the center of each source pixel after converting WebGL's bottom-left origin.
export function installResultEfbCopy(module,gl,{efbWidth=640,efbHeight=480}={}) {
  if(module.onNativeEfbCopy)throw Error('Native EFB copy receiver already owned');
  let copies=0,last=null;
  module.onNativeEfbCopy=(dest,x,y,width,height,format,clear)=>{
    if(!Number.isInteger(dest)||dest<=0||!Number.isInteger(x)||!Number.isInteger(y)||!Number.isInteger(width)||!Number.isInteger(height)||x<0||y<0||x+width>efbWidth||y+height>efbHeight||format!==5||clear!==0)throw Error('Invalid native result EFB copy');
    const dw=gl.drawingBufferWidth,dh=gl.drawingBufferHeight,rgba=new Uint8Array(width*height*4),pixel=new Uint8Array(4);
    for(let row=0;row<height;row++)for(let column=0;column<width;column++){
      const sx=Math.min(dw-1,Math.floor((x+column+.5)*dw/efbWidth)),sy=Math.min(dh-1,Math.floor((efbHeight-y-row-.5)*dh/efbHeight));
      gl.readPixels(sx,sy,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);rgba.set(pixel,(row*width+column)*4);
    }
    const encoded=encodeGX(rgba,width,height,format),size=textureByteLength(width,height,format);
    if(encoded.length!==size||dest+size>module.HEAPU8.length)throw Error('Native result EFB destination bounds');
    module.__dirtyMark?.(dest,size);module.HEAPU8.set(encoded,dest);copies++;last={dest,x,y,width,height,format,bytes:size};
  };
  return {snapshot:()=>({copies,last}),dispose(){delete module.onNativeEfbCopy;}};
}
