// Readback/image hashing runs off the simulation thread. Capture still uses
// browser GPU/media resources, so an observer-disabled control is mandatory.
// Copy the delivered frame into one reusable RGBA buffer and inspect a fixed
// nearest-neighbour grid. This avoids a second canvas scale/draw/readback while
// still checking every delivered 960x720 image for size, content and identity.
let scratch=new Uint8Array(0),queue=Promise.resolve(),failed=false;
async function inspect({frame,receivedMs}){
 const start=performance.now();try{
  const options={format:'RGBA'},size=frame.allocationSize(options);if(scratch.byteLength<size)scratch=new Uint8Array(size);
  const [layout]=await frame.copyTo(scratch,options),width=frame.displayWidth,height=frame.displayHeight;
  let hash=2166136261,nonblack=0;
  for(let y=0;y<72;y++){
   const sourceY=Math.min(height-1,Math.floor((y+.5)*height/72)),row=layout.offset+sourceY*layout.stride;
   for(let x=0;x<96;x++){
    const sourceX=Math.min(width-1,Math.floor((x+.5)*width/96)),at=row+sourceX*4,r=scratch[at],g=scratch[at+1],b=scratch[at+2];
    nonblack+=r+g+b>24;hash=Math.imul(hash^r,16777619);hash=Math.imul(hash^g,16777619);hash=Math.imul(hash^b,16777619);
   }
  }
  self.postMessage({row:{timestampMs:frame.timestamp/1000,receivedMs,width,height,hash:hash>>>0,nonblackPixels:nonblack},cost:performance.now()-start});
 }catch(error){failed=true;self.postMessage({error:String(error)});}finally{frame.close();}
}
self.onmessage=({data})=>{
 if(data.stop){queue.finally(()=>self.postMessage({stopped:true}));return;}
 if(failed){data.frame.close();return;}
 queue=queue.then(()=>inspect(data));
};
