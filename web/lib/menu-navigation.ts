import { menuIcons } from './melee-menu.ts';
/** Browser keyboard navigation over the bounds extracted from Melee's CSS table. */
export function adjacentIcon(id: number, dx: number, dy: number): number {
  const from = menuIcons.find((icon) => icon.id === id);
  if (!from) return menuIcons[0].id;
  const cx = (from.left + from.right) / 2;
  const cy = (from.top + from.bottom) / 2;
  let best = id,
    distance = Infinity;
  for (const icon of menuIcons) {
    const x = (icon.left + icon.right) / 2 - cx;
    const y = (icon.top + icon.bottom) / 2 - cy;
    const forward = x * dx + y * dy;
    if (forward <= 0.01) continue;
    const cross = Math.abs(x * dy - y * dx);
    const score = forward + cross * 4;
    if (score < distance) {
      best = icon.id;
      distance = score;
    }
  }
  return best;
}
