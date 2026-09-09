/** CharacterKind IDs, not FighterKind IDs: melee/src/melee/ft/forward.h. */
export const roster = [
  [22, 'Dr. Mario', 'Dr'],
  [8, 'Mario', 'Mr'],
  [7, 'Luigi', 'Lg'],
  [5, 'Bowser', 'Kp'],
  [12, 'Peach', 'Pe'],
  [17, 'Yoshi', 'Ys'],
  [1, 'Donkey Kong', 'Dk'],
  [0, 'Captain Falcon', 'Ca'],
  [25, 'Ganondorf', 'Gn'],
  [20, 'Falco', 'Fc'],
  [2, 'Fox', 'Fx'],
  [11, 'Ness', 'Ns'],
  [14, 'Ice Climbers', 'Pp'],
  [4, 'Kirby', 'Kb'],
  [16, 'Samus', 'Ss'],
  [18, 'Zelda', 'Zd'],
  [19, 'Sheik', 'Sk'],
  [6, 'Link', 'Lk'],
  [21, 'Young Link', 'Cl'],
  [24, 'Pichu', 'Pc'],
  [13, 'Pikachu', 'Pk'],
  [15, 'Jigglypuff', 'Pr'],
  [10, 'Mewtwo', 'Mt'],
  [3, 'Mr. Game & Watch', 'Gw'],
  [9, 'Marth', 'Ms'],
  [23, 'Roy', 'Fe'],
].map(([id, name, prefix]) => ({
  id: Number(id),
  name: String(name),
  prefix: String(prefix),
}));
export function character(id: number) {
  const fighter = roster.find((f) => f.id === id);
  if (!fighter) throw new Error('Choose a playable Melee character.');
  return fighter;
}
export const rules = Object.freeze({
  mode: 'stock',
  stage: 'battlefield',
  stocks: 4,
  timeLimitSeconds: 480,
  items: false,
  teams: false,
  cpuLevel: 9,
  damageRatio: 1,
  gameSpeed: 1,
});
export function createMatch(
  player: number,
  cpu: number,
  controls = { tapJump: true },
) {
  character(player);
  character(cpu);
  return {
    version: 1,
    controls: { tapJump: controls.tapJump },
    rules: { ...rules },
    players: [
      { port: 0, kind: 'human', characterId: player, costume: 0, stocks: 4 },
      {
        port: 1,
        kind: 'cpu',
        characterId: cpu,
        costume: player === cpu ? 1 : 0,
        stocks: 4,
        level: 9,
      },
    ],
  };
}
