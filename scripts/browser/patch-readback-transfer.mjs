import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
// Post-link experiment for Emscripten's WebGL2 readPixels import. Only the
// tightly packed RGBA8 backbuffer uses ordinary (non-shared) staging storage.
// PBO offsets and all other formats/packing retain the generated implementation.
export function patchReadbackTransfer(source) {
  const needle='GLctx.readPixels(x,y,width,height,format,type,heap,target);return';
  if(source.split(needle).length!==2)throw Error('Unexpected Emscripten readPixels import');
  return source.replace(needle,`if(format===6408&&type===5121&&width===960&&height===720&&target>=0&&target+width*height*4<=heap.length&&GLctx.getParameter(3330)===0&&GLctx.getParameter(3331)===0&&GLctx.getParameter(3332)===0){
    const length=width*height*4;
    const scratch=Module._meleeReadbackScratch||(Module._meleeReadbackScratch=new Uint8Array(length));
    scratch.set(heap.subarray(target,target+length));
    GLctx.readPixels(x,y,width,height,format,type,scratch);
    heap.set(scratch,target);
  }else{GLctx.readPixels(x,y,width,height,format,type,heap,target);}return`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: patch-readback-transfer.mjs INPUT OUTPUT');
  fs.writeFileSync(output,patchReadbackTransfer(fs.readFileSync(input,'utf8')));
}
