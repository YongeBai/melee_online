import test from 'node:test';
import assert from 'node:assert/strict';
import { menuIcons } from '../lib/melee-menu.ts';
import { adjacentIcon } from '../lib/menu-navigation.ts';

void test('Melee menu retains 9/9/7 tiles, shared Zelda tile, and all 26 starts', () => {
  assert.deepEqual(
    [20, 13, 6].map(
      (top) => menuIcons.filter((icon) => icon.top === top).length,
    ),
    [9, 9, 7],
  );
  assert.equal(
    menuIcons.some((icon) => icon.id === 19),
    false,
  );
  assert.deepEqual(
    [...menuIcons.map((icon) => icon.id), 19].sort((a, b) => a - b),
    Array.from({ length: 26 }, (_, id) => id),
  );
});
void test('keyboard navigation crosses the staggered bottom row and stops at outer edges', () => {
  assert.equal(adjacentIcon(2, 1, 0), 11); // Fox -> Ness
  assert.equal(adjacentIcon(2, 0, 1), 8); // Fox -> Mario
  assert.equal(adjacentIcon(2, 0, -1), 24); // Fox -> Pichu
  assert.equal(adjacentIcon(24, 0, 1), 2);
  assert.equal(adjacentIcon(22, -1, 0), 22);
  assert.equal(adjacentIcon(25, 1, 0), 25);
  assert.equal(adjacentIcon(22, 0, 1), 22);
  assert.equal(adjacentIcon(24, 0, -1), 24);
});
