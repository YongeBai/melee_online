import test from 'node:test';
import assert from 'node:assert/strict';
import {analyticsAllowed,tabMemory,createGameTracker,installAnalytics,roomMode} from '../../engines/browser-native/native-analytics.mjs';

function memoryStorage(){const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v))};}
function harness(room,picked={stage:31,players:[{character:2},{character:20}]}){
 const events=[],tracker=createGameTracker({track:(name,data)=>events.push(data?[name,data]:[name]),memory:tabMemory(memoryStorage()),room:()=>room,selection:()=>picked});
 const play=(...scenes)=>{for(const scene of scenes)tracker.observe({scene});};
 return {events,play,tracker};
}

test('only the public product page on a real host reports',()=>{
 const live={hostname:'playmelee.com',search:'?interactive=1'};
 assert.equal(analyticsAllowed(live),true);
 assert.equal(analyticsAllowed({...live,search:''}),false);
 assert.equal(analyticsAllowed({...live,search:'?interactive=1&noanalytics'}),false);
 assert.equal(analyticsAllowed({...live,search:'?interactive=1&diagnostic-cpu=1'}),false);
 assert.equal(analyticsAllowed({...live,webdriver:true}),false);
 assert.equal(analyticsAllowed({...live,userAgent:'Mozilla/5.0 HeadlessChrome/140'}),false);
 for(const hostname of ['localhost','127.0.0.1','[::1]','melee.localhost','melee.test'])assert.equal(analyticsAllowed({...live,hostname}),false);
});

test('counts every CPU match, including in-place returns to character select',()=>{
 const {events,play}=harness({code:'ABC234',seat:0,cpu:true,active:false});
 play('characters','loading-stage','stages','loading-match','match','results','characters','stages','loading-match','match','match-ended','characters');
 assert.deepEqual(events,[
  ['Match Started',{mode:'cpu',stage:'Battlefield'}],['Character Picked',{character:'Fox',mode:'cpu'}],['Match Finished',{mode:'cpu',outcome:'complete'}],
  ['Match Started',{mode:'cpu',stage:'Battlefield'}],['Character Picked',{character:'Fox',mode:'cpu'}],['Match Finished',{mode:'cpu',outcome:'ended'}],
 ]);
});

test('repeated states and abandoned menus do not count as matches',()=>{
 const {events,play}=harness({code:'ABC234',seat:0,cpu:true,active:false});
 play('characters','characters','stages','characters','results');
 assert.deepEqual(events,[]);
});

test('online games count once, from the room owner; each peer reports its own pick',()=>{
 const owner=harness({code:'ABC234',seat:0,cpu:false,active:true}),guest=harness({code:'ABC234',seat:1,cpu:false,active:true});
 for(const side of [owner,guest])side.play('characters','loading-match','match','results');
 assert.deepEqual(owner.events,[['Room Paired'],['Match Started',{mode:'online',stage:'Battlefield'}],['Character Picked',{character:'Fox',mode:'online'}],['Match Finished',{mode:'online',outcome:'complete'}]]);
 assert.deepEqual(guest.events,[['Room Joined'],['Character Picked',{character:'Falco',mode:'online'}]]);
});

test('room events repeat only for a new room code',()=>{
 const room={code:'ABC234',seat:1,cpu:false,active:true},{events,tracker}=harness(room);
 for(let i=0;i<5;i++)tracker.observe({scene:'characters'});
 room.code='XYZ789';tracker.observe({scene:'characters'});
 assert.deepEqual(events,[['Room Joined'],['Room Joined']]);
 // Offline fallback rooms never report.
 const offline=harness({offline:true,code:'',seat:0,cpu:true});offline.play('characters');assert.deepEqual(offline.events,[]);
});

test('a failed selection read still records the match',()=>{
 const events=[],tracker=createGameTracker({track:(n,d)=>events.push([n,d]),memory:tabMemory(null),room:()=>({code:'ABC234',seat:0,cpu:true}),selection:()=>{throw Error('unavailable');}});
 for(const scene of ['loading-match','match'])tracker.observe({scene});
 assert.deepEqual(events,[['Match Started',{mode:'cpu',stage:'Unknown'}]]);
 assert.equal(roomMode(null),'local');
});

test('install queues one page view per tab without query strings, and observes published states',()=>{
 const storage=memoryStorage(),appended=[];
 const makeWindow=()=>{const w={location:{hostname:'playmelee.com',search:'?interactive=1&join=ABC234',pathname:'/play/'},navigator:{userAgent:'Mozilla/5.0 Chrome/140'},sessionStorage:storage,addEventListener(){},nativeRoom:{code:'ABC234',seat:0,cpu:true,active:false},nativeCharacterMenu:{matchSelection:()=>({stage:32,players:[{character:9}]})}};return w;};
 const document={head:{appendChild:s=>appended.push(s)},createElement:()=>({dataset:{}}),addEventListener(){}};
 const first=makeWindow();installAnalytics({window:first,document});
 assert.equal(appended[0].src,'/_vercel/insights/script.js');assert.equal(appended[0].dataset.disableAutoTrack,'1');
 const beforeSend=first.vaq.find(a=>a[0]==='beforeSend')[1];
 assert.equal(beforeSend({type:'event',url:'https://playmelee.com/play/?interactive=1&join=ABC234'}).url,'https://playmelee.com/play/');
 for(const scene of ['characters','loading-match','match'])first.nativeMenuLiveState={scene};
 assert.equal(first.nativeMenuLiveState.scene,'match');
 assert.deepEqual(first.vaq.filter(a=>a[0]!=='beforeSend').map(a=>a[1].name??'pageview'),['pageview','Invite Opened','Match Started','Character Picked']);
 assert.deepEqual(first.vaq.find(a=>a[1].name==='Match Started')[1].data,{mode:'cpu',stage:'Final Destination'});
 // A room reload in the same tab repeats neither the page view nor the invite.
 const reloaded=makeWindow();installAnalytics({window:reloaded,document});
 assert.deepEqual(reloaded.vaq.filter(a=>a[0]!=='beforeSend'),[]);
 assert.equal(installAnalytics({window:{...makeWindow(),location:{hostname:'localhost',search:'?interactive=1',pathname:'/'}},document}),null);
});
