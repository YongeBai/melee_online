import {createNativeFrameClock} from './native-live.mjs';

// Original C menus own selection, animation and exit decisions. This layer only
// supplies wall-clock pacing and routes completed scenes to their next owner.
export function startNativeMenuLive(menu,input,{onState=()=>{},onResults=()=>{},onError=()=>{},matchParams={},network=null,module=null}={}) {
  const clock=createNativeFrameClock(performance.now(),60,{align:true,toleranceMs:.25});
  let scene='characters',active=menu,raf=0,stopped=false,busy=false,frames=0,draws=0,controller=0;
  const transitions=[];
  const snapshot=()=>({scene,frames,draws,busy,controller,transitions:[...transitions],state:active?.read()??null});
  function publish(next){scene=next;transitions.push({scene,frames});onState(snapshot());}
  function reset(){clock.reset();}
  function stop(){if(stopped)return;stopped=true;cancelAnimationFrame(raf);document.removeEventListener('visibilitychange',reset);removeEventListener('blur',reset);removeEventListener('focus',reset);}
  function fail(error){stop();onError(error);}
  async function transition(){
    busy=true;const previous=scene,result=active.finish();active=null;
    if(previous==='characters'){
      if(result.phase===2){publish('exited');busy=false;return;}
      publish('loading-stage');await menu.toStage(controller);if(stopped)return;
      active=globalThis.nativeStageMenu;publish('stages');
    }else if(!result.stage){menu.restart(true);active=menu;publish('characters');}
    else{
      publish('loading-match');
      const params={...matchParams};if(!network?.active)delete params.rollback;const promise=menu.startMatch(params,{browserInput:input,network,onLive:()=>{busy=false;publish('match');}});
      // The match scheduler takes over after loading; keep the input owner alive
      // so held buttons and key-up events are sampled at native initialization.
      stop();const report=await promise;
      if(report.error)throw Error(report.error);busy=false;publish(report.results?'results':'match-ended');input.dispose();if(report.results)await onResults(report);return;
    }
    network?.begin(scene);busy=false;clock.reset();raf=requestAnimationFrame(frame);
  }
  function frame(now){
    if(stopped||busy||scene==='exited')return;
    try{
      if(document.hidden){reset();raf=requestAnimationFrame(frame);return;}
      const steps=clock.take(now,4);let exit=false,advanced=0;
      for(let i=0;i<steps;i++){
        const samples=network?.take(input.samples(2),module)??(network?.active?null:input.samples(2));if(!samples){clock.reset();break;}const state=active.step([...samples,null,null]);frames++;advanced++;
        if(scene==='characters'&&state.phase===1){const start=samples.findIndex(s=>s[0]&0x1000);if(start>=0)controller=start;}
        if(state.exit){exit=true;break;}
      }
      if(advanced){active.draw();draws++;if(draws%30===0)onState(snapshot());}
      if(exit){void transition().catch(fail);return;}
      raf=requestAnimationFrame(frame);
    }catch(error){fail(error);}
  }
  document.addEventListener('visibilitychange',reset);addEventListener('blur',reset);addEventListener('focus',reset);
  network?.begin(scene);active.draw();publish(scene);raf=requestAnimationFrame(frame);
  return {snapshot,stop,restart(){if(stopped||busy||scene!=='exited')throw Error('Character menu is not at its entry boundary');menu.restart();active=menu;publish('characters');clock.reset();raf=requestAnimationFrame(frame);}};
}
