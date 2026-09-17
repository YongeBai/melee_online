import {lettering} from './native-product-ui.mjs';
import {resultTitle,returnTicket,saveReturn,validateResults} from './native-results.mjs';
import {standardNativeSample} from './native-input.mjs';
export function showNativeResults({results,selection,network}){
 results=validateResults(results);
 const dialog=document.createElement('dialog');dialog.id='nativeResults';dialog.setAttribute('aria-label','Match results');
 dialog.innerHTML='<div class="controls-surface"><p class="results-preview">Temporary results screen</p><h1><canvas></canvas></h1><p class="results-reason"></p><table><thead><tr><th>Player</th><th>Stocks</th><th>Damage</th></tr></thead><tbody></tbody></table><p class="results-status" role="status"></p><button id="rematchButton" class="room-action"><canvas></canvas></button><button id="charactersButton" class="room-action"><canvas></canvas></button><p class="results-help">Enter / P: Rematch · O: Character Select</p></div>';
 document.body.append(dialog);void lettering(dialog.querySelector('h1 canvas'),resultTitle(results));
 dialog.querySelector('.results-reason').textContent=results.outcome===1?'Time!':results.outcome===2?'Game!':'Match ended';
 const body=dialog.querySelector('tbody');results.players.forEach((p,i)=>{const row=document.createElement('tr');for(const text of ['P'+(i+1)+(p.kind?' CPU':'')+(p.winner?' — Winner':''),p.stocks,p.percent+'%']){const cell=document.createElement('td');cell.textContent=text;row.append(cell);}body.append(row);});
 const rematch=dialog.querySelector('#rematchButton'),characters=dialog.querySelector('#charactersButton'),status=dialog.querySelector('.results-status');void lettering(rematch.querySelector('canvas'),'Rematch');void lettering(characters.querySelector('canvas'),'Character Select');
 let sent=false,lastButtons=standardNativeSample(navigator.getGamepads?.()[0])[0],raf;
 function refresh(){const ready=!network.active||network.state.phase==='results';rematch.disabled=!ready||sent;characters.disabled=!ready;status.textContent=!ready?'Waiting for opponent results':network.active?(sent?'Waiting for opponent rematch':'Both players must choose Rematch'):'';}
 function choose(action){if((action==='rematch'?rematch:characters).disabled)return;try{const ticket=returnTicket(action,selection);if(network.active){network.chooseResult(action);sent=action==='rematch';refresh();}else{saveReturn(ticket);network.dispose();location.reload();}}catch(e){status.textContent=e.message;}}
 rematch.onclick=()=>choose('rematch');characters.onclick=()=>choose('characters');
 const key=e=>{if(['Enter','KeyP','KeyO','Escape'].includes(e.code)){e.preventDefault();if(e.repeat)return;choose(['Enter','KeyP'].includes(e.code)?'rematch':'characters');}};
 dialog.addEventListener('cancel',e=>{e.preventDefault();choose('characters');});addEventListener('keydown',key);
 function frame(){refresh();const p=standardNativeSample(navigator.getGamepads?.()[0]),pressed=p[0]&~lastButtons;lastButtons=p[0];if(pressed&0x1100)choose('rematch');else if(pressed&0x200)choose('characters');raf=requestAnimationFrame(frame);}
 if(network.active)network.endMatch({results,selection:returnTicket('rematch',selection)});
 dialog.showModal();refresh();raf=requestAnimationFrame(frame);
 return {results,dispose(){cancelAnimationFrame(raf);removeEventListener('keydown',key);dialog.close();dialog.remove();}};
}
