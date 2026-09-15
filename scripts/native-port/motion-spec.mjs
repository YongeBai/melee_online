import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
export function readMotionSpec(upstream) {
  const data=fs.readFileSync(path.join(upstream,'src/melee/ft/ftdata.c'),'utf8');
  const action=fs.readFileSync(path.join(upstream,'src/melee/ft/ftaction.c'),'utf8');
  const table=/ftData_Table_Unk0\[Ft_Kind_Max\] = \{([\s\S]*?)\n\};/.exec(data)?.[1];
  const load=/ftData_OnLoad\[Ft_Kind_Max\] = \{([\s\S]*?)\n\};/.exec(data)?.[1];
  const lengths=/static u8 ftAction_803C0870\[[^\n]+ = \{([\s\S]*?)\n\};/.exec(action)?.[1];
  if(!table||!load||!lengths)throw Error('Original motion metadata declarations changed');
  const counts=[...table.matchAll(/\{\s*0,\s*(\d+)\s*\}/g)].map(m=>Number(m[1]));
  const codes=[...load.matchAll(/ft(\w+)_Init_OnLoad/g)].map(m=>m[1]);
  const actionWords=lengths.split(',').map(s=>s.trim()).filter(Boolean).map(Number);
  if(counts.length!==33||codes.length!==33||actionWords.length!==49||actionWords.some(n=>!Number.isInteger(n)||n<1||n>7))
    throw Error('Original motion metadata dimensions changed');
  return {codes,counts,commandWords:[1,1,1,1,1,2,1,2,1,1,...actionWords],
    sourceSha256:createHash('sha256').update(data).update(action).digest('hex')};
}
