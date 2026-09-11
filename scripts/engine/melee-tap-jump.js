// GALE01 1.02 jump checks, verified against the original DOL. These hooks skip
// only the stick-jump branch for port 1. They preserve analog aiming, attack
// windows, button jumps, jump counts, and the level-9 CPU's original input.
export const TAP_JUMP_FLAG = 0x80002f00;
const hooks = [
  { at: 0x800cae88, original: 0xc0240624, fighter: 4, buttons: 0x800caeb4 },
  { at: 0x800cb818, original: 0xc0230624, fighter: 3, buttons: 0x800cb83c },
  { at: 0x800cafb0, original: 0xc03f0624, fighter: 31, buttons: 0x800cafe8 },
  { at: 0x800d7420, original: 0xc03c0624, fighter: 28, buttons: 0x800d7434 },
  // MWCC inlined the same checks in these callers; patching only the exported
  // functions leaves standing/running and aerial tap jumps enabled.
  { at: 0x800caf04, original: 0xc0240624, fighter: 4, buttons: 0x800caf30 },
  { at: 0x800cb060, original: 0xc0240624, fighter: 4, buttons: 0x800cb08c },
  { at: 0x800cb988, original: 0xc03e0624, fighter: 30, buttons: 0x800cb9ac },
];
const branch = (from, to) => (0x48000000 | ((to - from) & 0x03fffffc)) >>> 0;
export function installTapJumpHooks(read, write, online = false) {
  // The vanilla executable starts at 0x80003100. This is the unused low-memory
  // code-handler area. Refuse to overwrite a disc mod using the same space.
  for (let i = 0; i < hooks.length; i++) {
    const hook = hooks[i],
      cave = 0x80002800 + i * 0x80;
    const current = read(hook.at);
    if (current === branch(hook.at, cave)) continue;
    if (current !== hook.original) throw new Error("Tap-jump hook does not match Melee 1.02");
    for (let j = 0; j < 64; j += 4)
      if (read(cave + j) !== 0) throw new Error("Melee code-handler area already in use");
  }
  for (let i = 0; i < hooks.length; i++) {
    const h = hooks[i],
      cave = 0x80002800 + i * 0x80;
    // Use volatile r0/r12 and CR0; replay the displaced lfs on the normal path.
    const words = online ? [
      // Read the fighter's assigned controller port, then that port's flag.
      (0x8800000c | (h.fighter << 16)) >>> 0,
      0x28000001, // cmplwi r0,1
      0x41810028, // bgt normal
      0x3d808000, // lis r12,0x8000
      0x398c2f00, // addi r12,r12,flag
      0x7c0c00ae, // lbzx r0,r12,r0
      0x2c000000,
      0x41820014, // beq normal
      (0x80000004 | (h.fighter << 16)) >>> 0,
      0x2c00000b, // Nana keeps AI stick jumps
      0x41820008,
      branch(cave+44,h.buttons),
      h.original,
      branch(cave+52,h.at+4),
    ] : [
      0x3d808000, // lis r12,0x8000
      0x880c2f00, // lbz r0,flag(r12)
      0x2c000000, // cmpwi r0,0 (tap jump enabled)
      0x41820024, // beq normal (+36)
      (0x8800000c | (h.fighter << 16)) >>> 0, // lbz r0,player_id(fp)
      0x2c000000,
      0x40820018, // bne normal: preserve CPU input
      (0x80000004 | (h.fighter << 16)) >>> 0, // lwz r0,kind(fp)
      0x2c00000b, // cmpwi r0,Nana: AI partner retains stick jumps
      0x4182000c,
      branch(cave + 40, h.buttons),
      0x60000000,
      h.original,
      branch(cave + 52, h.at + 4),
    ];
    words.forEach((word, j) => write(cave + j * 4, word));
    write(h.at, branch(h.at, cave));
  }
}
