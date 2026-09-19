// Only original gm_Scene_Vs_OnExit computes rankings. Browser UI reads its result.
export function readNativeResults(module){
 module._portTournamentFinish();const read=(f,p=0)=>module._portTournamentResultRead(f,p);
 return {outcome:read(0),frames:read(1),winnerCount:read(2),players:[0,1].map(p=>({character:read(3,p),kind:read(4,p),stocks:read(5,p),percent:read(6,p),score:read(7,p),winner:!!read(8,p),kos:read(9,p),falls:read(10,p),selfDestructs:read(11,p)}))};
}
export function returnTicket(action,selection){
 if(!['rematch','characters'].includes(action)||!selection||![2,3,8,28,31,32].includes(selection.stage)||!Array.isArray(selection.players)||selection.players.length<2)throw Error('Invalid tournament return');
 const players=selection.players.slice(0,2).map((p,i)=>{
  if(!Number.isInteger(p.character)||p.character<0||p.character>25||!Number.isInteger(p.costume)||p.costume<0||p.costume>5||![0,1].includes(p.kind)||(i===0&&p.kind!==0))throw Error('Invalid tournament player');
  return {character:p.character,costume:p.costume,kind:p.kind};
 });return {action,stage:selection.stage,players};
}
export function validateResults(value){
 if(!value||![1,2,7,8,9].includes(value.outcome)||!Number.isInteger(value.frames)||value.frames<0||value.frames>28800||!Number.isInteger(value.winnerCount)||value.winnerCount<0||value.winnerCount>2||!Array.isArray(value.players)||value.players.length!==2)throw Error('Invalid native results');
 const players=value.players.map(p=>{
  if(!p||!Number.isInteger(p.character)||p.character<0||p.character>25||![0,1].includes(p.kind)||!Number.isInteger(p.stocks)||p.stocks<0||p.stocks>4||!Number.isInteger(p.percent)||p.percent<0||p.percent>65535||!Number.isInteger(p.score)||typeof p.winner!=='boolean'||!Number.isInteger(p.kos)||p.kos<0||p.kos>65535||!Number.isInteger(p.falls)||p.falls<0||p.falls>65535||!Number.isInteger(p.selfDestructs)||p.selfDestructs<0||p.selfDestructs>65535)throw Error('Invalid native standings');
  return {character:p.character,kind:p.kind,stocks:p.stocks,percent:p.percent,score:p.score,winner:p.winner,kos:p.kos,falls:p.falls,selfDestructs:p.selfDestructs};
 });if(players.filter(p=>p.winner).length!==value.winnerCount)throw Error('Invalid native winner count');
 return {outcome:value.outcome,frames:value.frames,winnerCount:value.winnerCount,players};
}
export function resultTitle(result){return ![1,2].includes(result.outcome)?'No Contest':result.winnerCount===1?'Player '+(result.players.findIndex(p=>p.winner)+1)+' Wins':'Draw';}
const characterNames=['Captain Falcon','Donkey Kong','Fox','Mr Game and Watch','Kirby','Bowser','Link','Luigi','Mario','Marth','Mewtwo','Ness','Peach','Pikachu','Ice Climbers','Jigglypuff','Samus','Yoshi','Zelda','Sheik','Falco','Young Link','Dr Mario','Roy','Pichu','Ganondorf'];
export function resultCharacterName(character){if(!Number.isInteger(character)||character<0||character>=characterNames.length)throw Error('Invalid result character');return characterNames[character];}
// gm_1601.c ckind_victory_themes -> lbaudio_ax.static.h hps_files.
const victoryTracks=['ff_fzero.hps','ff_dk.hps','ff_fox.hps','ff_flat.hps','ff_kirby.hps','ff_mario.hps','ff_link.hps','ff_mario.hps','ff_mario.hps','ff_emb.hps','ff_poke.hps','ff_nes.hps','ff_mario.hps','ff_poke.hps','ff_ice.hps','ff_poke.hps','ff_samus.hps','ff_yoshi.hps','ff_link.hps','ff_link.hps','ff_fox.hps','ff_link.hps','ff_mario.hps','ff_emb.hps','ff_poke.hps','ff_link.hps'];
export function resultVictoryTrack(character){resultCharacterName(character);return victoryTracks[character];}
const storageKey='native-melee-return-v1';
export function saveReturn(ticket,storage=globalThis.sessionStorage){storage.setItem(storageKey,JSON.stringify(returnTicket(ticket.action,ticket)));}
export function consumeReturn(storage=globalThis.sessionStorage){try{const value=JSON.parse(storage.getItem(storageKey));storage.removeItem(storageKey);return value?returnTicket(value.action,value):null;}catch{return null;}}
