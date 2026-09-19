import {createKeyboardModel} from './keyboard-model.js';
const glyphs=new Map();
export async function lettering(canvas,value){
 if(canvas.dataset.text===value)return;canvas.dataset.text=value;canvas.setAttribute('aria-label',value);
 const images=await Promise.all([...value].map(c=>{if(c===' ')return null;if(!glyphs.has(c))glyphs.set(c,new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>resolve(null);i.src='./assets/glyph-'+c.charCodeAt(0)+'.png';}));return glyphs.get(c);}));
 if(canvas.dataset.text!==value)return;canvas.width=images.reduce((n,i)=>n+(i?.width??12),0)||1;canvas.height=32;const ctx=canvas.getContext('2d');let x=0;for(const i of images){if(i)ctx.drawImage(i,x,0);x+=i?.width??12;}
}
export function createNativeProductUI({module,input,menu,canvas,allowCPU=false}){
 const link=document.createElement('link');link.rel='stylesheet';link.href='./native-product.css';document.head.append(link);
 const viewport=document.createElement('main');viewport.id='gameViewport';canvas.before(viewport);viewport.append(canvas);canvas.style.visibility='hidden';
 const panel=document.createElement('section');panel.id='roomPanel';panel.setAttribute('aria-label','Two-player room');
 panel.innerHTML='<canvas id="roomStatus" role="status"></canvas><div class="room-code"><img src="./assets/room-code.png" alt="Your code"><button id="copyRoom" aria-label="Copy room code"><canvas id="ownCode"></canvas></button></div><form id="joinRoom"><label for="joinCode"><img src="./assets/room-join.png" alt="Join room"></label><div class="code-entry"><input id="joinCode" aria-label="Room code" maxlength="6" autocomplete="off" spellcheck="false"><canvas id="typedCode" aria-hidden="true"></canvas></div><button id="joinSubmit" type="submit" aria-label="Join room"><span aria-hidden="true">▶</span></button></form><button id="readyRoom" class="room-action"><img src="./assets/room-ready.png" alt="Ready"></button><button id="cpuRoom" class="room-action"><canvas></canvas></button><button id="kickRoom" class="room-action"><canvas></canvas></button><button id="leaveRoom" class="room-action"><canvas></canvas></button>';
 viewport.append(panel);
 const keyboard=document.createElement('button');keyboard.id='keyboardButton';keyboard.setAttribute('aria-label','Keyboard controls');keyboard.innerHTML='<svg viewBox="0 0 32 22"><rect x="1" y="1" width="30" height="20" rx="3"/><path d="M5 6h3m3 0h3m3 0h3m3 0h3M5 11h3m3 0h3m3 0h3m3 0h3M7 16h18"/></svg>';viewport.append(keyboard);
 const peer=document.createElement('span');peer.id='peerKeyboard';peer.innerHTML=keyboard.innerHTML;peer.hidden=true;peer.setAttribute('aria-label','Player 2 keyboard');viewport.append(peer);
 const dialog=document.createElement('dialog');dialog.id='controls';dialog.setAttribute('aria-label','Keyboard controls');
 dialog.innerHTML='<div class="controls-surface"><div id="keyboardModel" role="img" aria-label="3D keyboard controls"></div><label class="tap-setting"><img class="tap-label" src="./assets/tap-jump.png" alt="Tap jump"><input id="tapJump" type="checkbox" role="switch" checked><span class="toggle" aria-hidden="true"></span></label><button id="closeControls" class="menu-button" aria-label="Back"><img src="./assets/MnMaAll-1bf200.png" alt="Back"></button></div>';document.body.append(dialog);
 const notice=document.createElement('section');notice.id='roomNotice';notice.hidden=true;notice.setAttribute('role','alert');notice.innerHTML='<p></p><button><canvas></canvas></button>';document.body.append(notice);void lettering(notice.querySelector('canvas'),'Start Melee');notice.querySelector('button').onclick=()=>network?.newRoom();
 let model,scene='characters',network=null,cpu=true,modalRaf=0,modalB=false;const $=s=>document.getElementById(s);
 const message=s=>void lettering($('roomStatus'),s);
 let previousA=false,consumedA=false;
 input.setInterceptor(samples=>{const sample=samples[input.keyboardPort],pressed=!!(sample[0]&0x100);if(!pressed)consumedA=false;
 if(scene==='characters'&&pressed&&!previousA&&!dialog.open){const p=menu.read().players[input.keyboardPort],shift=input.keyboardPort?44.75:0;if(p.x>=-25+shift&&p.x<=-22+shift&&p.y>=-23.1&&p.y<=-20.4){show();consumedA=true;}else{const point=globalThis.nativeMenuHandPoint?.(p.x,p.y);if(point){const r=canvas.getBoundingClientRect(),x=r.x+point[0]*r.width,y=r.y+point[1]*r.height;for(const control of panel.querySelectorAll('button,input')){if(control.hidden||control.disabled||!control.getClientRects().length)continue;const b=control.getBoundingClientRect();if(x>=b.left&&x<=b.right&&y>=b.top&&y<=b.bottom){control.tagName==='INPUT'?control.focus():control.click();consumedA=true;break;}}}}}
 previousA=pressed;if(consumedA)sample[0]&=~0x100;
 });
 function pollModal(){const b=!!navigator.getGamepads?.()[0]?.buttons?.[2]?.pressed;if(b&&!modalB){close();return;}modalB=b;if(dialog.open)modalRaf=requestAnimationFrame(pollModal);}
 const show=()=>{if(scene!=='characters'||dialog.open)return;input.suspend(true);document.body.classList.add('controls-open');dialog.showModal();model??=createKeyboardModel($('keyboardModel'));model.setVisible(true);modalB=!!navigator.getGamepads?.()[0]?.buttons?.[2]?.pressed;modalRaf=requestAnimationFrame(pollModal);};
 const close=()=>{cancelAnimationFrame(modalRaf);document.body.classList.remove('controls-open');dialog.close();model?.setVisible(false);input.suspend(false);};keyboard.onclick=show;$('closeControls').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 try{$('tapJump').checked=localStorage.getItem('native-melee-tap-jump')!=='0';}catch{}module._portTapJumpSet(input.keyboardPort,+$('tapJump').checked);
 $('tapJump').onchange=()=>{try{localStorage.setItem('native-melee-tap-jump',$('tapJump').checked?'1':'0');}catch{}module._portTapJumpSet(input.keyboardPort,+$('tapJump').checked);network?.setTapJump(+$('tapJump').checked);};
 addEventListener('keydown',e=>{
  if(dialog.open){if(e.code==='Escape'||e.code==='KeyO'){e.preventDefault();close();}return;}
  if(e.target.closest?.('input'))return;
  if(scene==='characters'&&e.code==='KeyP'){
   const p=menu.read().players[input.keyboardPort],shift=input.keyboardPort?44.75:0;
   if(p.x>=-25+shift&&p.x<=-22+shift&&p.y>=-23.1&&p.y<=-20.4){e.preventDefault();show();}
  }
 });
 $('readyRoom').onclick=()=>{try{if(network?.active)network.ready();else if(cpu)input.pulse(0x1000);}catch(e){message(e.message);}};
 $('cpuRoom').onclick=()=>{try{if(network)network.cpuMode(!cpu);else{cpu=!cpu;module._portMenuSetCPU(+cpu);refresh();}}catch(e){message('Cannot change opponent now');}};
 $('kickRoom').onclick=()=>network?.kick();$('leaveRoom').onclick=()=>network?.leave();
 $('joinCode').addEventListener('focus',()=>input.suspend(true));$('joinCode').addEventListener('blur',()=>input.suspend(false));$('joinCode').oninput=e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-Z2-9]/g,'');void lettering($('typedCode'),e.target.value);};
 $('joinRoom').onsubmit=async e=>{e.preventDefault();if(!network){message('Connecting room service');return;}try{await network.join($('joinCode').value);}catch(e){message(e.message);}};
 $('copyRoom').onclick=async()=>{if(network?.code){await navigator.clipboard.writeText(network.code);message('Copied');}};
 function position(){const regions=globalThis.nativeMenuApertures;if(!regions)return;for(const [el,r] of [[panel,regions[0]],[keyboard,regions[network?.seat?2:1]],[peer,regions[network?.seat?1:2]]])Object.assign(el.style,{left:r.left*100+'%',top:r.top*100+'%',width:r.width*100+'%',height:r.height*100+'%'});}
 function visibility(){panel.hidden=keyboard.hidden=scene!=='characters';peer.hidden=scene!=='characters'||cpu;}
 function refresh(){visibility();const state=network?.state;message(cpu?'CPU Level 9':state?.hasGuest?state.connected.every(Boolean)?state.ready.every(Boolean)?'Starting':state.ready[state.seat]?'Waiting for Ready':'Player connected':'Player disconnected':'Waiting for player');void lettering($('cpuRoom').querySelector('canvas'),cpu?'Remove CPU':'Play CPU Lv 9');void lettering($('kickRoom').querySelector('canvas'),'Kick');void lettering($('leaveRoom').querySelector('canvas'),'Leave');peer.setAttribute('aria-label',network?.seat?'Player 1 keyboard':'Player 2 keyboard');$('readyRoom').classList.toggle('selected',!!state?.ready[state.seat]);$('joinRoom').hidden=!!state?.hasGuest;$('readyRoom').hidden=!cpu&&!network?.connected;$('cpuRoom').hidden=!allowCPU||!!network?.offline||!!state?.seat||!!state?.hasGuest;panel.querySelector('.room-code').hidden=!!network?.offline;$('kickRoom').hidden=!!state?.seat||!state?.hasGuest;$('leaveRoom').hidden=!state?.seat;$('readyRoom').disabled=!!state?.ready[state.seat];}
 refresh();void lettering($('ownCode'),'');
 return {setNetwork(value){network=value;document.body.classList.add('online-room');document.body.dataset.seat=value.seat;keyboard.setAttribute('aria-label','Player '+(value.seat+1)+' keyboard controls');network.setTapJump(+$('tapJump').checked);if(cpu!==value.cpu){cpu=value.cpu;if(scene==='characters')module._portMenuSetCPU(+cpu);}void lettering($('ownCode'),value.code);refresh();},update(s){scene=s.scene;position();visibility();if(dialog.open&&scene!=='characters')close();},message,close,connectionError(error){close();input.suspend(true);notice.querySelector('p').textContent=error.message;notice.hidden=false;}};
}
