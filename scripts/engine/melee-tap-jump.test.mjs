import { test } from "node:test";
import assert from "node:assert/strict";
import { installTapJumpHooks, TAP_JUMP_FLAG } from "./melee-tap-jump.js";

const originals = new Map([
  [0x800cae88, 0xc0240624],
  [0x800cb818, 0xc0230624],
  [0x800cafb0, 0xc03f0624],
  [0x800d7420, 0xc03c0624],
  [0x800caf04, 0xc0240624],
  [0x800cb060, 0xc0240624],
  [0x800cb988, 0xc03e0624],
]);
const targets = [
  0x800caeb4, 0x800cb83c, 0x800cafe8, 0x800d7434, 0x800caf30, 0x800cb08c, 0x800cb9ac,
];
// Execute the actual emitted PPC subset, independently decoding instructions.
function execute(memory, start, player, disabled, kind = 2) {
  const regs = new Uint32Array(32);
  for (const r of [3, 4, 31, 28, 30]) regs[r] = 0x81000000;
  let pc = start,
    eq = false,
    gt = false,
    replayed = false;
  for (let count = 0; count < 30; count++) {
    if (pc === start + 4 || targets.includes(pc)) return { pc, replayed };
    const word = memory.get(pc);
    assert.notEqual(word, undefined, `instruction at ${pc.toString(16)}`);
    const op = word >>> 26,
      rt = (word >>> 21) & 31,
      ra = (word >>> 16) & 31,
      imm = (word << 16) >> 16;
    if (op === 18) {
      let offset = word & 0x3fffffc;
      if (offset & 0x2000000) offset -= 0x4000000;
      pc = (pc + offset) >>> 0;
      continue;
    }
    if (op === 16) {
      const bo = (word >>> 21) & 31;
      assert.ok(bo === 12 || bo === 4);
      const condition=((word>>>16)&31)===1?gt:eq;
      if ((bo === 12 && condition) || (bo === 4 && !condition)) {
        pc = (pc + ((word << 16) >> 16)) >>> 0;
        continue;
      }
    } else if (op === 15) regs[rt] = ((ra ? regs[ra] : 0) + (imm << 16)) >>> 0;
    else if(op===14) regs[rt]=((ra?regs[ra]:0)+imm)>>>0;
    else if(op===10){gt=regs[ra]>(word&65535);eq=regs[ra]===(word&65535);}
    else if(op===31){
      assert.equal((word>>>1)&1023,87);
      const address=(regs[ra]+regs[(word>>>11)&31])>>>0;
      assert.ok(address===TAP_JUMP_FLAG||address===TAP_JUMP_FLAG+1);
      regs[rt]=Number(disabled[address-TAP_JUMP_FLAG]);
    }
    else if (op === 34) {
      const address = (regs[ra] + imm) >>> 0;
      assert.ok(address === TAP_JUMP_FLAG || address === 0x8100000c);
      regs[rt] = address === TAP_JUMP_FLAG ? Number(disabled) : player;
    } else if (op === 32) {
      assert.equal((regs[ra] + imm) >>> 0, 0x81000004);
      regs[rt] = kind;
    } else if (op === 11) eq = regs[ra] === imm;
    else if (op === 48) {
      assert.equal(word, originals.get(start));
      replayed = true;
    } else assert.fail(`Unexpected instruction ${word.toString(16)}`);
    pc += 4;
  }
  assert.fail("Hook did not return");
}
test("all seven hooks, including inlined checks, preserve CPU input and button jumps", () => {
  const memory = new Map(originals);
  installTapJumpHooks(
    (a) => memory.get(a) || 0,
    (a, v) => memory.set(a, v),
  );
  for (const [i, start] of [...originals.keys()].entries()) {
    assert.deepEqual(execute(memory, start, 0, true), { pc: targets[i], replayed: false });
    assert.deepEqual(execute(memory, start, 0, false), { pc: start + 4, replayed: true });
    assert.deepEqual(execute(memory, start, 1, true), { pc: start + 4, replayed: true });
    assert.deepEqual(execute(memory, start, 0, true, 11), { pc: start + 4, replayed: true });
  }
  const before = new Map(memory);
  installTapJumpHooks(
    (a) => memory.get(a) || 0,
    (a, v) => memory.set(a, v),
  );
  assert.deepEqual(memory, before);
});
test('online jump hooks use independent port settings and preserve Nana',()=>{
 const memory=new Map(originals);installTapJumpHooks(a=>memory.get(a)||0,(a,n)=>memory.set(a,n),true);
 for(const [i,start] of [...originals.keys()].entries())for(const flags of [[false,true],[true,false],[true,true],[false,false]]){
  for(const port of [0,1])assert.deepEqual(execute(memory,start,port,flags),flags[port]?{pc:targets[i],replayed:false}:{pc:start+4,replayed:true});
  assert.deepEqual(execute(memory,start,1,flags,11),{pc:start+4,replayed:true});
  assert.deepEqual(execute(memory,start,2,flags),{pc:start+4,replayed:true});
 }
});
test("an incompatible executable or occupied code area is rejected before any write", () => {
  for (const invalid of [new Map(), new Map([...originals, [0x80002800, 1]])]) {
    let writes = 0;
    assert.throws(() =>
      installTapJumpHooks(
        (a) => invalid.get(a) || 0,
        () => writes++,
      ),
    );
    assert.equal(writes, 0);
  }
});
