import {nativeKeyboardCodes,meleeKeyboardCodes,meleeKeyboardSample,keyboardNativeSample,standardNativeSample,neutralNativeSample} from './native-input.mjs';

// One input owner survives asynchronous menu/match asset loads. Only the scene
// scheduler changes; held keys and releases must not disappear at that boundary.
export function createBrowserNativeInput({layout="diagnostic",target=globalThis,document=globalThis.document,getGamepads=()=>globalThis.navigator?.getGamepads?.()??[],getControllers=()=>[]}={}) {
  const keys=new Set(),codes=layout==="melee"?meleeKeyboardCodes:nativeKeyboardCodes,keyboardSample=layout==="melee"?meleeKeyboardSample:keyboardNativeSample;let focused=true,keyboardPort=0,disposed=false,suspended=false,pulseUntil=0,pulseButtons=0,networkSeat=null,interceptor=null;
  function input(event){if(event.target?.closest?.('input,textarea,[contenteditable=true]'))return;if(!codes.has(event.code))return;event.preventDefault();event.type==='keydown'?keys.add(event.code):keys.delete(event.code);}
  function clear(){keys.clear();}
  function blur(){focused=false;clear();}
  function focus(){focused=true;clear();}
  for(const type of ['keydown','keyup'])target.addEventListener(type,input);
  target.addEventListener('blur',blur);target.addEventListener('focus',focus);document.addEventListener('visibilitychange',clear);
  return {
    setInterceptor(fn){interceptor=fn;},
    pulse(buttons){pulseButtons=buttons;pulseUntil=performance.now()+100;},
    suspend(value){suspended=!!value;clear();},
    setNetworkSeat(seat){networkSeat=seat;keyboardPort=seat;clear();},
    get keyboardPort(){return keyboardPort;},
    setKeyboardPort(port){if(!Number.isInteger(port)||port<0||port>1)throw Error('Keyboard player must be 1 or 2');clear();keyboardPort=port;},
    samples(count=2){
      const live=focused&&!document.hidden&&!disposed,pads=live?getGamepads():[],controllers=live?getControllers():[];
      // Adapter controllers (already normalized) come before standard gamepads.
      const sources=[...controllers,...Array.from(pads??[]).filter(p=>p?.connected!==false&&p?.mapping==="standard").map(standardNativeSample)];
      const result=Array.from({length:count},(_,i)=>!focused||document.hidden||disposed||suspended?neutralNativeSample():i===keyboardPort&&keys.size?keyboardSample(keys):[...(sources[networkSeat===null?i:i===networkSeat?0:-1]??neutralNativeSample())]);
      if(!suspended&&focused&&!document.hidden&&performance.now()<pulseUntil)result[keyboardPort][0]|=pulseButtons;interceptor?.(result);if(suspended)result.forEach(s=>s.fill(0));return result;
    },
    dispose(){if(disposed)return;disposed=true;clear();for(const type of ['keydown','keyup'])target.removeEventListener(type,input);target.removeEventListener('blur',blur);target.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',clear);},
  };
}
