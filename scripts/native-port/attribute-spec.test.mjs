import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAttributeLayout} from './attribute-spec.mjs';
const layout=`*** Dumping AST Record Layout
         0 | struct Entry
         0 |   int value
         4 |   u8 flag
           | [sizeof=8, align=4]

*** Dumping AST Record Layout
         0 | struct PortAttribute_Test
         0 |   struct Attributes value
         0 |     float scale
         4 |     GXColor[2] colors
        12 |     struct Entry[2] entries
        28 |     u16[2] indices
           | [sizeof=32, align=4]
`;
test('compiler layout parser expands nested records/arrays and preserves packed widths',()=> {
  const result=parseAttributeLayout(layout,'PortAttribute_Test');
  assert.equal(result.size,32);assert.equal(result.fields.length,15);
  assert.deepEqual(result.fields.find(f=>f.name==='entries[1].value'),{name:'entries[1].value',offset:20,width:4,kind:'word'});
  assert.deepEqual(result.fields.find(f=>f.name==='colors[1].a'),{name:'colors[1].a',offset:11,width:1,kind:'byte'});
  assert.deepEqual(result.fields.at(-1),{name:'indices[1]',offset:30,width:2,kind:'half'});
});
test('compiler layout parser rejects overlap, unsupported fields, truncation and bitfields',()=> {
  for(const text of [layout.replace('28 |','24 |'),layout.replace('float scale','double scale'),
    layout.replace('sizeof=32','sizeof=31'),layout.replace('0 |     float','0:0-1 |     unsigned int')])
    assert.throws(()=>parseAttributeLayout(text,'PortAttribute_Test'));
});
