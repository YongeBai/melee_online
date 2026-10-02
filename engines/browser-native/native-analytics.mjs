// First-party usage analytics for playmelee.com, via Vercel Web Analytics.
// The Vercel script is same-origin (/_vercel/insights/script.js), so it passes
// the page's COEP/CORP isolation. Nothing here writes to the WASM heap or
// changes game behavior: game events come from observing the state the page
// already publishes (globalThis.nativeMenuLiveState, globalThis.nativeRoom).
//
// Deliberately minimal, since every event is billed. Per tab, one page view
// (which also gives unique visitors). Per match:
//   Match Played       {stage}       room owner or CPU player only, so each
//                                    game counts once
//   Character Picked   {character}   each human player's own pick

export const characterNames=['Captain Falcon','Donkey Kong','Fox','Mr. Game & Watch','Kirby','Bowser','Link','Luigi','Mario','Marth','Mewtwo','Ness','Peach','Pikachu','Ice Climbers','Jigglypuff','Samus','Yoshi','Zelda','Sheik','Falco','Young Link','Dr. Mario','Roy','Pichu','Ganondorf'];
export const stageNames={2:'Fountain of Dreams',3:'Pokémon Stadium',8:"Yoshi's Story",28:'Dream Land',31:'Battlefield',32:'Final Destination'};
const stageName=id=>stageNames[id]??(Number.isInteger(id)?'Stage '+id:'Unknown');
const storageKey='melee-analytics-v1';

// Only the public product page on a real host reports. Local servers, probes,
// headless or automated browsers and diagnostic pages never do.
export function analyticsAllowed({hostname='',search='',webdriver=false,userAgent=''}={}){
 const params=new URLSearchParams(search);
 if(!params.has('interactive')||params.has('noanalytics')||params.has('diagnostic-cpu'))return false;
 if(webdriver||/Headless/i.test(userAgent))return false;
 return !(hostname==='localhost'||hostname==='127.0.0.1'||hostname==='[::1]'||hostname.endsWith('.localhost')||hostname.endsWith('.test')||hostname==='');
}

// Per-tab memory, so room reloads (join, kick) do not repeat the page view. Storage failures only lose dedupe.
export function tabMemory(storage){
 let seen;try{seen=new Set(JSON.parse(storage?.getItem(storageKey)??'[]'));}catch{seen=new Set();}
 return {once(key){if(seen.has(key))return false;seen.add(key);try{storage?.setItem(storageKey,JSON.stringify([...seen]));}catch{}return true;}};
}

export function roomMode(room){return room?.active?'online':room?.cpu?'cpu':'local';}

// Turns the scene sequence characters -> stages -> loading-match -> match into
// match events. Called on every published state.
export function createGameTracker({track,room=()=>globalThis.nativeRoom,selection=()=>globalThis.nativeCharacterMenu?.matchSelection?.()}){
 let scene=null,pending=null;
 return {observe(state){
  const next=state?.scene;if(!next||next===scene)return;
  const previous=scene;scene=next;
  if(next==='loading-match'){
   // The stage menu has finished; this is the selection startMatch reads.
   const r=room(),mode=roomMode(r),seat=r?.seat===1?1:0;let picked=null;
   try{picked=selection();}catch{}
   pending={mode,seat,stage:stageName(picked?.stage),character:characterNames[picked?.players?.[seat]?.character]??null};
  }else if(next==='match'&&previous!=='match'){
   const m=pending??{mode:roomMode(room()),seat:room()?.seat===1?1:0,stage:'Unknown',character:null};pending=null;
   if(!(m.mode==='online'&&m.seat!==0))track('Match Played',{stage:m.stage});
   if(m.character)track('Character Picked',{character:m.character});
  }
 }};
}

export function installAnalytics({window:w=globalThis,document:d=globalThis.document}={}){
 const {location:l,navigator:n}=w;
 if(!d||!analyticsAllowed({hostname:l?.hostname,search:l?.search,webdriver:n?.webdriver===true,userAgent:n?.userAgent}))return null;
 let storage=null;try{storage=w.sessionStorage;}catch{}
 const memory=tabMemory(storage);
 w.va??=function(...args){(w.vaq??=[]).push(args);};
 // Room codes travel in ?join= invite links; never report query strings.
 w.va('beforeSend',event=>({...event,url:String(event.url).split(/[?#]/)[0]}));
 const track=(name,data)=>{try{w.va('event',data?{name,data}:{name});}catch{}};
 // One page view per tab: room epoch changes reload the page.
 if(memory.once('pageview'))w.va('pageview',{route:l.pathname,path:l.pathname});
 const script=d.createElement('script');script.src='/_vercel/insights/script.js';script.defer=true;script.dataset.disableAutoTrack='1';script.dataset.sdkn='melee-online';d.head.appendChild(script);
 const tracker=createGameTracker({track,room:()=>w.nativeRoom,selection:()=>w.nativeCharacterMenu?.matchSelection?.()});
 let value=w.nativeMenuLiveState;
 Object.defineProperty(w,'nativeMenuLiveState',{configurable:true,enumerable:true,get:()=>value,set(v){value=v;try{tracker.observe(v);}catch{}}});
 return {track,tracker};
}

if(typeof document!=='undefined')installAnalytics();
