// Local integration probe. Visible button pulses let browser QA deliver inputs
// across at least one emulated frame; this does not simulate game outcomes.
import {inputStateFromPressed} from './input.js';
const panel = document.createElement('div');
panel.setAttribute('aria-label', 'Melee engine test inputs');
panel.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:9999;display:flex;gap:6px;padding:8px;background:#10151eee;border:1px solid #b2becc;flex-wrap:wrap';
let releaseTimer;
for (const [name,control] of [['A','A'],['B','B'],['Start','START'],['Up','STICK_UP'],['Down','STICK_DOWN'],['Left','STICK_LEFT'],['Right','STICK_RIGHT']]) {
  const button = document.createElement('button');
  button.textContent = `GC ${name}`;
  button.style.cssText = 'color:white;background:#293650;border:1px solid #a0acc1;padding:8px';
  button.addEventListener('click', () => {
    clearTimeout(releaseTimer);
    window.__host.setInputState(inputStateFromPressed(new Set([control])));
    releaseTimer = setTimeout(() => window.__host.setInputState(inputStateFromPressed(new Set())), 160);
  });
  panel.append(button);
}
document.body.append(panel);
for (const [name,control] of [['A','A'],['Start','START']]) {
  const button = document.createElement('button');
  button.textContent = `Hold GC ${name}`;
  button.setAttribute('aria-pressed','false');
  button.style.cssText = 'color:white;background:#45362b;border:1px solid #d0bc92;padding:8px';
  button.addEventListener('click', () => {
    clearTimeout(releaseTimer);
    const held = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed',String(held));
    window.__host.setInputState(inputStateFromPressed(new Set(held ? [control] : [])));
  });
  panel.append(button);
}

const inspectButton=document.createElement('button');inspectButton.textContent='Inspect Melee input';
const report=document.createElement('pre');report.style.cssText='max-width:90vw;max-height:160px;overflow:auto;font-size:10px;white-space:pre-wrap';
inspectButton.onclick=async()=>{try{report.textContent=JSON.stringify(await window.__host.adapter.request('meleeInspect',{}));}catch(e){report.textContent=e.message;}};
panel.append(inspectButton,report);
