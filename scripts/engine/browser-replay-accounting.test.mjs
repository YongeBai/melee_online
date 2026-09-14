import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {differsOnlyInUnusedIdleAccounting as classify} from './browser-replay-accounting.js';

function fixture() {
  const sections=Array.from({length:29},(_,i)=>({name:i===7?'CoreTiming':'section'+i,startA:i*100,startB:i*100,bytesA:100,bytesB:100,unmatchedBytes:0,differentBytes:0,ranges:[],rangeCount:0,rangesTruncated:false,fieldsComplete:true}));
  const field={name:'CoreTiming.m_idled_cycles',startRelativeOffset:12,bytes:8,containsWholeRange:true};
  Object.assign(sections[7],{differentBytes:2,rangeCount:1,ranges:[{offset:12,bytes:2,fieldA:{...field},fieldB:{...field}}]});
  return {sizeA:2900,sizeB:2900,sections};
}
test('only complete diffs confined to the unused idle accumulator qualify',()=>{
 assert.equal(classify(fixture()),true);
 for(const mutate of[
   r=>r.sizeB++,r=>r.sections.pop(),r=>r.sections[0].startA++,r=>r.sections[0].bytesB++,
   r=>r.sections[0].name='CoreTiming',r=>r.sections[0].differentBytes++,
   r=>r.sections[7].unmatchedBytes++,r=>r.sections[7].differentBytes++,
   r=>r.sections[7].rangesTruncated=true,r=>r.sections[7].fieldsComplete=false,
   r=>r.sections[7].rangeCount++,r=>r.sections[7].ranges[0].offset=11,
   r=>r.sections[7].ranges[0].offset=19,r=>r.sections[7].ranges[0].bytes=0,
   r=>r.sections[7].ranges[0].fieldA.name='CoreTiming.next_event_order',
   r=>r.sections[7].ranges[0].fieldB.name='CoreTiming.m_globals.global_timer',
   r=>r.sections[7].ranges[0].fieldB.containsWholeRange=false,
   r=>r.sections[7].ranges[0].fieldB.bytes=16,
 ]){const result=fixture();mutate(result);assert.equal(classify(result),false);}
 assert.equal(classify(null),false);
});

test('Dolphin idle accumulator remains unused by emulation execution',()=>{
 const root='engines/wasm-dolphin/vendor/dolphin/Source/Core';
 const hits=[];
 function walk(path){for(const entry of readdirSync(path,{withFileTypes:true})){
  const file=join(path,entry.name);if(entry.isDirectory())walk(file);
  else if(/\.(?:cpp|h|hpp|inc|mm)$/.test(file))for(const line of readFileSync(file,'utf8').split('\n'))
   if(/\b(?:m_idled_cycles|GetIdleTicks)\b/.test(line))hits.push([file.slice(root.length+1),line.trim()]);
 }}
 walk(root);
 assert.deepEqual(hits.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),[
  ['Core/CoreTiming.h','u64 GetIdleTicks() const;'],
  ['Core/CoreTiming.h','s64 m_idled_cycles = 0;'],
  ['Core/CoreTiming.cpp','m_idled_cycles = 0;'],
  ['Core/CoreTiming.cpp','p.Do(m_idled_cycles);'],
  ['Core/CoreTiming.cpp','State::BrowserRecordField(p, "CoreTiming.m_idled_cycles", sizeof(m_idled_cycles));'],
  ['Core/CoreTiming.cpp','u64 CoreTimingManager::GetIdleTicks() const'],
  ['Core/CoreTiming.cpp','return static_cast<u64>(m_idled_cycles);'],
  ['Core/CoreTiming.cpp','m_idled_cycles += DowncountToCycles(ppc_state.downcount);'],
  ['Core/CoreTiming.cpp','snapshot["idleCycles"] = picojson::value(std::to_string(m_idled_cycles));'],
 ].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),
 'A new consumer requires auditing this classification again; never silently discard a live clock.');
});
