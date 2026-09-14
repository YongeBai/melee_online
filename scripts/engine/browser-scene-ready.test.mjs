import test from'node:test';import assert from'node:assert/strict';import{isLoadedMeleeMatch}from'./browser-scene-ready.js';
test('cosmetics and QA transitions wait for native fighter initialization',()=>{
 const ready={major:2,minor:2,sceneKind:2,sceneFrame:302,fighters:[{character:14},{character:14}]};
 assert.equal(isLoadedMeleeMatch(ready),true);assert.equal(isLoadedMeleeMatch({...ready,fighters:[1,2,3,4]}),true);
 for(const state of[undefined,{...ready,sceneFrame:122},{...ready,sceneFrame:240},{...ready,fighters:[]},{...ready,fighters:[{}]},{...ready,minor:1},{...ready,sceneKind:9},{...ready,major:1}])assert.equal(isLoadedMeleeMatch(state),false);
});
