import {nativeKeyboardCodes,keyboardNativeSample,standardNativeSample,neutralNativeSample} from './native-input.mjs';

// One input owner survives asynchronous menu/match asset loads. Only the scene
// scheduler changes; held keys and releases must not disappear at that boundary.
export function createBrowserNativeInput({target=globalThis,document=globalThis.document,getGamepads=()=>globalThis.navigator?.getGamepads?.()??[]}={}) {
  const keys=new Set();let focused=true,keyboardPort=0,disposed=false;
  function input(event){if(!nativeKeyboardCodes.has(event.code))return;event.preventDefault();event.type==='keydown'?keys.add(event.code):keys.delete(event.code);}
  function clear(){keys.clear();}
  function blur(){focused=false;clear();}
  function focus(){focused=true;clear();}
  for(const type of ['keydown','keyup'])target.addEventListener(type,input);
  target.addEventListener('blur',blur);target.addEventListener('focus',focus);document.addEventListener('visibilitychange',clear);
  return {
    get keyboardPort(){return keyboardPort;},
    setKeyboardPort(port){if(!Number.isInteger(port)||port<0||port>1)throw Error('Keyboard player must be 1 or 2');clear();keyboardPort=port;},
    samples(count=2){
      const pads=focused&&!document.hidden&&!disposed?getGamepads():[];
      return Array.from({length:count},(_,i)=>!focused||document.hidden||disposed?neutralNativeSample():i===keyboardPort&&keys.size?keyboardNativeSample(keys):standardNativeSample(pads[i]));
    },
    dispose(){if(disposed)return;disposed=true;clear();for(const type of ['keydown','keyup'])target.removeEventListener(type,input);target.removeEventListener('blur',blur);target.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',clear);},
  };
}
