// GameCube controller adapter (Nintendo WUP-028 and compatibles in Wii U
// mode) over WebHID. Raw controller bytes follow the console path: the SDK
// subtracts the origin captured when a controller connects, then Melee's
// HSD_PadClamp (gmmain.c: stick radius 80, triggers 140, no deadzone shift)
// and HSD_PadScale produce the normalized values the port boundary receives.
export const gcAdapterFilter={vendorId:0x057E,productId:0x0337};
const INPUT_REPORT=0x21,START_POLLING=0x13;
const clampS8=v=>Math.max(-128,Math.min(127,v));
// HSD_PadClampCheck3 with min 0, max 80: scale onto the circle, truncating
// through the s8 casts exactly as the float-to-integer conversion does.
function clampStick(x,y){
 const r=Math.hypot(x,y);if(r>80){x=Math.trunc(x*80/r);y=Math.trunc(y*80/r);}
 return [x/80,y/80];
}
// HSD_PadClampCheck1 with min 0, max 140, then scale by 140.
const trigger=v=>Math.min(Math.max(0,v),140)/140;

// Button bytes: 1 = A B X Y Left Right Down Up, 2 = Start Z R L.
const buttonMap=[[1,0x01,0x100],[1,0x02,0x200],[1,0x04,0x400],[1,0x08,0x800],[1,0x10,1],[1,0x20,2],[1,0x40,4],[1,0x80,8],[2,0x01,0x1000],[2,0x02,0x10],[2,0x04,0x20],[2,0x08,0x40]];
export function gcPortConnected(block){return ((block[0]>>4)&3)!==0;}
export function gcOrigin(block){return {x:block[3],y:block[4],cx:block[5],cy:block[6],l:block[7],r:block[8]};}
export function gcNativeSample(block,origin){
 let buttons=0;for(const [byte,mask,bit] of buttonMap)if(block[byte]&mask)buttons|=bit;
 const [x,y]=clampStick(clampS8(block[3]-origin.x),clampS8(block[4]-origin.y)),[cx,cy]=clampStick(clampS8(block[5]-origin.cx),clampS8(block[6]-origin.cy));
 return [buttons,x,y,cx,cy,trigger(block[7]-origin.l),trigger(block[8]-origin.r)];
}

export function createGcAdapter({hid=globalThis.navigator?.hid,onChange=()=>{}}={}){
 let device=null,origins=[null,null,null,null],latest=[null,null,null,null],reports=0,error=null;
 function report(event){
  if(event.reportId!==INPUT_REPORT)return;const bytes=new Uint8Array(event.data.buffer,event.data.byteOffset,event.data.byteLength);if(bytes.length<36)return;reports++;
  for(let port=0;port<4;port++){
   const block=bytes.subarray(port*9,port*9+9);
   if(!gcPortConnected(block)){if(origins[port])onChange();origins[port]=null;latest[port]=null;continue;}
   // A newly connected controller reports its resting position first.
   if(!origins[port]){origins[port]=gcOrigin(block);onChange();}
   latest[port]=gcNativeSample(block,origins[port]);
  }
 }
 async function open(candidate){
  if(!candidate.opened)await candidate.open();
  candidate.addEventListener('inputreport',report);await candidate.sendReport(START_POLLING,new Uint8Array(0));
  device=candidate;error=null;onChange();
 }
 const adapter={
  get supported(){return !!hid;},
  get connected(){return !!device;},
  // Reopen an adapter the player already granted, without a prompt.
  async reconnect(){if(!hid||device)return adapter.connected;try{const [known]=(await hid.getDevices()).filter(d=>d.vendorId===gcAdapterFilter.vendorId&&d.productId===gcAdapterFilter.productId);if(known)await open(known);}catch(e){error=String(e.message??e);}return adapter.connected;},
  // Must run from a click or key press: the browser shows its device chooser.
  async request(){if(!hid)throw Error('This browser cannot access USB controller adapters (WebHID)');const [chosen]=await hid.requestDevice({filters:[gcAdapterFilter]});if(!chosen)return false;await open(chosen);return true;},
  // Controllers in plugged-in order drive the local player first.
  samples(){return latest.filter(Boolean);},
  snapshot:()=>({supported:!!hid,connected:!!device,ports:origins.map(Boolean),reports,error}),
  async dispose(){const d=device;device=null;if(d){d.removeEventListener('inputreport',report);try{await d.close();}catch{}}},
 };
 hid?.addEventListener?.('disconnect',({device:d})=>{if(d===device){device=null;origins=[null,null,null,null];latest=[null,null,null,null];onChange();}});
 return adapter;
}
