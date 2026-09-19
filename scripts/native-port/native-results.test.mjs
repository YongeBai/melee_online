import test from 'node:test';import assert from 'node:assert/strict';
import {returnTicket,saveReturn,consumeReturn,validateResults,resultCharacterName,resultTitle,resultVictoryTrack} from '../../engines/browser-native/native-results.mjs';
const selection={stage:31,players:[{character:20,costume:0,kind:0},{character:2,costume:0,kind:1}]};
test('return tickets carry only two playable slots and tournament stages',()=>{
 for(const stage of [2,3,8,28,31,32])assert.equal(returnTicket('rematch',{...selection,stage,seconds:3,items:4}).stage,stage);
 for(const stage of [0,1,5,10,30,33])assert.throws(()=>returnTicket('rematch',{...selection,stage}));
 assert.throws(()=>returnTicket('adventure',selection));assert.throws(()=>returnTicket('rematch',{...selection,players:[{character:26,costume:0,kind:0},selection.players[1]]}));
 assert.equal(returnTicket('characters',selection).seconds,undefined);
 const map=new Map(),storage={setItem:(k,v)=>map.set(k,v),getItem:k=>map.get(k),removeItem:k=>map.delete(k)};
 saveReturn(returnTicket('rematch',selection),storage);assert.deepEqual(consumeReturn(storage),returnTicket('rematch',selection));assert.equal(consumeReturn(storage),null);
 storage.setItem('native-melee-return-v1','broken');assert.equal(consumeReturn(storage),null);
});
test('result titles use native winner flags, preserving timeout draws and no contest',()=>{
 const players=[0,1].map(i=>({character:i,kind:0,stocks:4,percent:0,score:0,winner:true,kos:0,falls:0,selfDestructs:0}));
 const tie=validateResults({outcome:1,frames:28800,winnerCount:2,players});assert.equal(resultTitle(tie),'Draw');
 assert.equal(resultTitle({...tie,outcome:7}),'No Contest');assert.equal(resultTitle({...tie,outcome:2,winnerCount:1,players:[{...players[0],winner:false},players[1]]}),'Player 2 Wins');
 assert.equal(resultCharacterName(0),'Captain Falcon');assert.equal(resultCharacterName(14),'Ice Climbers');assert.equal(resultCharacterName(25),'Ganondorf');assert.throws(()=>resultCharacterName(26));
 assert.deepEqual(Array.from({length:26},(_,character)=>resultVictoryTrack(character)),['ff_fzero.hps','ff_dk.hps','ff_fox.hps','ff_flat.hps','ff_kirby.hps','ff_mario.hps','ff_link.hps','ff_mario.hps','ff_mario.hps','ff_emb.hps','ff_poke.hps','ff_nes.hps','ff_mario.hps','ff_poke.hps','ff_ice.hps','ff_poke.hps','ff_samus.hps','ff_yoshi.hps','ff_link.hps','ff_link.hps','ff_fox.hps','ff_link.hps','ff_mario.hps','ff_emb.hps','ff_poke.hps','ff_link.hps']);
 assert.throws(()=>validateResults({...tie,winnerCount:1}));assert.throws(()=>validateResults({...tie,outcome:0}));assert.throws(()=>validateResults({...tie,frames:28801}));
});
