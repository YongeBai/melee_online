import test from 'node:test';
import assert from 'node:assert/strict';
import {renameBoundaryDefinitions} from './game-link.mjs';
test('browser boundary replacement renames definitions while retaining public declarations and callers',()=>{
  const original='extern void* load(int);\nvoid* load(int size)\n{ return original_load(size); }\nvoid* caller(void) { return load(42); }\n';
  const output=renameBoundaryDefinitions(original,['load']);
  assert.equal(output,'extern void* load(int);\nvoid* port_unlinked_load(int size)\n{ return original_load(size); }\nvoid* caller(void) { return load(42); }\n');
  assert.throws(()=>renameBoundaryDefinitions(original,['missing']),/exactly one/);
  assert.throws(()=>renameBoundaryDefinitions(original+'void* load(int x) { return 0; }',['load']),/exactly one/);
});
