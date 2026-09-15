import test from'node:test';import assert from'node:assert/strict';import{verifyFountainReflectionState}from'./browser-reflection-replay.js';
function fixture(mismatch=false){let frame=400,enabled=true;const calls=[];const host={adapter:{request:async(t,d)=>{calls.push([t,d]);if(d.action==='restore')frame=400;if(d.action==='step')frame++;if(d.action==='fountainReflection'){enabled=d.enabled;return {objects:[{}]};}if(d.action==='fountainReflectionState')return {major:2,minor:2,sceneKind:2,sceneFrame:frame,match:{stage:2},platforms:[{},{}],camera:{fov:enabled||!mismatch?30:31},fighters:[{character:2},{character:20}],allActors:[{kind:1},{kind:22}]};return {};}}};return{host,calls};}
test('cosmetic replay compares all frames but never claims full-machine equality',async()=>{const f=fixture();const result=await verifyFountainReflectionState(f.host,{frames:120});assert.equal(result.passed,true);assert.equal(result.fullMachineEquivalence,false);assert.equal(result.framesCompared,120);assert.equal(f.calls.filter(([,d])=>d.action==='pads').length,240);assert.equal(f.calls.at(-2)[1].action,'clear');assert.equal(f.calls.at(-1)[0],'start');});
test('camera divergence fails immediately and restores original callback and inputs',async()=>{const f=fixture(true);const result=await verifyFountainReflectionState(f.host,{frames:120});assert.equal(result.passed,false);assert.equal(result.mismatch.frame,0);assert.equal(f.calls.at(-3)[1].enabled,true);assert.equal(f.calls.at(-2)[1].action,'clear');});

test('empty fighter probes cannot pass a cosmetic replay',async()=>{const f=fixture(),request=f.host.adapter.request;f.host.adapter.request=async(t,d)=>{const r=await request(t,d);return d.action==='fountainReflectionState'?{...r,fighters:[],allActors:[]}:r;};await assert.rejects(verifyFountainReflectionState(f.host,{frames:120}),/Two player slots/);assert.equal(f.calls.filter(([,d])=>d.action==='capture').length,0);});

test('Stadium cosmetic replays compare transformation state and reject a changed stage joint',async()=>{
 for(const feature of['stadiumscreen','stadiumdecoration'])for(const mismatch of[false,true]){
  let frame=400,enabled=true;const actions=[];
  const host={adapter:{request:async(t,d)=>{actions.push(d);if(d.action==='restore')frame=400;if(d.action==='step')frame++;
   if(d.action===(feature==='stadiumscreen'?'stadiumScreen':'stadiumDecoration')){enabled=d.enabled;return{objects:[{}]};}
   if(d.action==='stadiumGameplayState')return{sceneFrame:frame,match:{stage:3},randomSeed:123,camera:{fov:30},fighters:[{character:2},{character:20}],allActors:[{kind:1},{kind:22}],platforms:[{mapId:2,modeWords:[frame>460?1:0],joints:[{matrix:[enabled||!mismatch?10:11]}]}]};return{};}}};
  const r=await verifyFountainReflectionState(host,{feature,frames:120});assert.equal(r.passed,!mismatch);assert.equal(r.fullMachineEquivalence,false);assert.equal(r.kind,'stadium-gameplay-observable-comparison');assert.equal(actions.at(-3).enabled,true);
 }
});

test('Battlefield replay preserves gameplay and RNG while changing only map-1 animation',async()=>{
 for(const mismatch of[false,true]){
  let frame=400,enabled=true;const actions=[];
  const host={adapter:{request:async(t,d)=>{actions.push(d);if(d.action==='restore')frame=400;if(d.action==='step')frame++;
   if(d.action==='staticBackgroundAnimation'){enabled=d.enabled;return{objects:[{mapId:1}]};}
   if(d.action==='tournamentGameplayState')return{sceneFrame:frame,match:{stage:31},randomSeed:enabled||!mismatch?123:124,camera:{fov:30},fighters:[{character:2},{character:20}],allActors:[{kind:1},{kind:22}],platforms:[]};return{};}}};
  const r=await verifyFountainReflectionState(host,{feature:'staticbackground',frames:120});assert.equal(r.passed,!mismatch);assert.equal(r.fullMachineEquivalence,false);assert.equal(r.kind,'battlefield-gameplay-observable-comparison');assert.equal(actions.at(-3).enabled,true);
 }
});

test('Yoshi stage-background replay keeps Randall and native camera while skipping only decorative drawing',async()=>{
 for(const cameraMismatch of[false,true]){
  let frame=400,draw=true;const actions=[];
  const host={adapter:{request:async(t,d)=>{
   actions.push(d);
   if(d.action==='restore')frame=400;
   if(d.action==='step')frame++;
   if(d.action==='stageBackground'){
    draw=d.enabled;
    return{objects:[{mapId:1},{mapId:2,preservedGameplay:'Randall'}],writes:[],codeWrites:[]};
   }
   if(d.action==='yoshiGameplayState')return{
    sceneFrame:frame,match:{stage:8},randomSeed:123,
    camera:{fov:draw||!cameraMismatch?30:31},
    fighters:[{character:14},{character:14}],allActors:[{character:14},{character:14},{partner:1},{partner:2}],
    items:[],platforms:[{mapId:0},{mapId:2,x:frame},{mapId:3}],
   };
   return{};
  }}};
  const result=await verifyFountainReflectionState(host,{feature:'stagebackground',frames:120});
  assert.equal(result.passed,!cameraMismatch);
  if(!cameraMismatch){assert.equal(result.randallMoved,true);assert.equal(result.framesCompared,120);assert.equal(result.fullMachineEquivalence,false);}
  else assert.equal(result.mismatch.frame,0);
  assert.equal(actions.at(-3).enabled,true);
 }
});

test('Yoshi stage-background replay refuses to hide Randall',async()=>{
 let frame=400;const actions=[];
 const host={adapter:{request:async(t,d)=>{
  actions.push(d);if(d.action==='step')frame++;
  if(d.action==='stageBackground')return{objects:[{mapId:1},{mapId:2}],writes:[],codeWrites:[]};
  if(d.action==='yoshiGameplayState')return{sceneFrame:frame,match:{stage:8},fighters:[{character:2},{character:20}],allActors:[{},{}],items:[],platforms:[{mapId:0},{mapId:2},{mapId:3}],camera:{fov:30}};
  return{};
 }}};
 await assert.rejects(verifyFountainReflectionState(host,{feature:'stagebackground',frames:120}),/preserve Randall/);
 assert.equal(actions.some(d=>d.action==='capture'),false);
});
