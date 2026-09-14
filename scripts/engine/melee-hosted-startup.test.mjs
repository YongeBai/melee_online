import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('browser release automatically loads its hosted game without an ISO prompt',()=>{
  const source=fs.readFileSync(new URL('./melee-runtime.js',import.meta.url),'utf8');
  assert.match(source,/const hostedGame = !nativeEngine && document\.documentElement\.dataset\.hostedGame/);
  assert.match(source,/if \(hostedGame && !browserDisc\)[\s\S]*loadHostedGame\(hostedGame/);
  assert.match(source,/begin\.hidden = Boolean\(hostedGame\)/);
  assert.match(source,/if \(hostedGame\)[\s\S]*void begin\.onclick\(\)/);
  const pickerBranch=source.match(/if \(!nativeEngine && !browserDisc[^\n]+/u)?.[0]||'';
  assert.match(pickerBranch,/&& !hostedGame/);
});

test('black-background performance mode is applied during every live tournament match',()=>{
  const source=fs.readFileSync(new URL('./melee-runtime.js',import.meta.url),'utf8');
  assert.match(source,/const loadedMatch = isLoadedMeleeMatch\(state\);[\s\S]*if \(params\.get\(["']background["']\) === ["']black["']\)[\s\S]*applyRuntimeSettingOnce\(["']stage-background["'], ["']stageBackground["'], false\)/);
});

test('dry-audio performance mode disables only auxiliary reverb during every live match',()=>{
  const source=fs.readFileSync(new URL('./melee-runtime.js',import.meta.url),'utf8');
  assert.match(source,/const loadedMatch = isLoadedMeleeMatch\(state\);[\s\S]*if \(params\.get\(["']reverb["']\) === ["']off["']\)[\s\S]*applyRuntimeSettingOnce\(["']aux-reverb["'], ["']auxReverb["'], false\)/);
});
