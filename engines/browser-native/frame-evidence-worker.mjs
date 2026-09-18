// Readback/image hashing runs off the simulation thread. Capture still uses
// browser GPU/media resources, so an observer-disabled control is mandatory.
// Scale the complete delivered frame on the worker, then read only the 96x72
// evidence surface. This keeps the game canvas at 960x720 while avoiding a
// multi-megabyte CPU copy for each post-draw snapshot.
const canvas=new OffscreenCanvas(96,72),context=canvas.getContext('2d');let queue=Promise.resolve(),failed=false;
async function inspect({frame,receivedMs}){
 const start=performance.now();try{
  const width=frame.displayWidth,height=frame.displayHeight;context.drawImage(frame,0,0,96,72);const bytes=context.getImageData(0,0,96,72).data;
  let hash=2166136261,nonblack=0;for(let i=0;i<bytes.length;i+=4){nonblack+=bytes[i]+bytes[i+1]+bytes[i+2]>24;for(let j=0;j<3;j++)hash=Math.imul(hash^bytes[i+j],16777619);}
  self.postMessage({row:{timestampMs:frame.timestamp/1000,receivedMs,width,height,sampleRegion:'full-frame-downsample',hash:hash>>>0,nonblackPixels:nonblack},cost:performance.now()-start});
 }catch(error){failed=true;self.postMessage({error:String(error)});}finally{frame.close();}
}
self.onmessage=({data})=>{
 if(data.stop){queue.finally(()=>self.postMessage({stopped:true}));return;}
 if(failed){data.frame.close();return;}
 queue=queue.then(()=>inspect(data));
};
