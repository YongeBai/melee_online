// Readback/image hashing runs off the simulation thread. Capture still uses
// browser GPU/media resources, so an observer-disabled control is mandatory.
const canvas=new OffscreenCanvas(96,72),context=canvas.getContext('2d',{willReadFrequently:true});
self.onmessage=({data})=>{if(data.stop){self.postMessage({stopped:true});return;}const {frame,receivedMs}=data,start=performance.now();try{
 context.drawImage(frame,0,0,96,72);const bytes=context.getImageData(0,0,96,72).data;
 let hash=2166136261,nonblack=0;for(let i=0;i<bytes.length;i+=4){nonblack+=bytes[i]+bytes[i+1]+bytes[i+2]>24;for(let j=0;j<3;j++)hash=Math.imul(hash^bytes[i+j],16777619);}
 self.postMessage({row:{timestampMs:frame.timestamp/1000,receivedMs,width:frame.displayWidth,height:frame.displayHeight,hash:hash>>>0,nonblackPixels:nonblack},cost:performance.now()-start});
}catch(e){self.postMessage({error:String(e)});}finally{frame.close();}};
