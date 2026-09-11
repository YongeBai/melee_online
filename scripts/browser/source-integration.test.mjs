import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root = path.resolve(import.meta.dirname, '../..');
const engine = path.join(root, 'engines/wasm-dolphin');
const manifest = JSON.parse(fs.readFileSync(new URL('./source-integration.json', import.meta.url)));
for (const patch of manifest.patches) {
  test(patch.name + ' checksum and text-only content', () => {
    const bytes = fs.readFileSync(new URL(patch.name, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), patch.sha256);
    assert.equal(bytes.length, patch.bytes);
    assert.ok(!bytes.includes('GIT binary patch'));
  });
  test(patch.name + ' reproduces the complete recorded source tree', {
    skip:!fs.existsSync(path.join(engine, 'vendor/dolphin/.git')),
  }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'melee-patch-verify-'));
    const cwd = patch.name.startsWith('dolphin-') ? path.join(engine, 'vendor/dolphin') : engine;
    const env = {...process.env, GIT_INDEX_FILE:path.join(dir, 'index')};
    const git = args => execFileSync('git', args, {cwd, env, encoding:'utf8'}).trim();
    try {
      const vendor = patch.name.startsWith('dolphin-');
      git(['read-tree', vendor ? manifest.dolphinCommit : manifest.engineCommit]);
      if (vendor) {
        const lock = JSON.parse(fs.readFileSync(path.join(engine, 'provenance/dolphin-source.lock.json')));
        for (const p of lock.patches.filter(p => p.cwd === '.'))
          git(['apply', '--cached', '--unidiff-zero', path.join(engine, p.path)]);
      }
      assert.equal(git(['write-tree']), patch.baseTree);
      git(['apply', '--cached', path.join(import.meta.dirname, patch.name)]);
      assert.equal(git(['write-tree']), patch.resultTree);
    } finally { fs.rmSync(dir, {recursive:true, force:true}); }
  });
}
