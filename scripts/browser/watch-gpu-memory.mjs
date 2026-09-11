// Optional Linux/AMDGPU soak diagnostic. These are device-wide counters;
// close other GPU workloads before interpreting a slope as an engine leak.
import fs from 'node:fs';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
const duration=Number(process.argv[2]??120),output=process.argv[3];
if(!Number.isFinite(duration)||duration<1||duration>3600||!output)
  throw Error('Usage: node scripts/browser/watch-gpu-memory.mjs SECONDS OUTPUT.json');
const root='/sys/class/drm';
const card=fs.readdirSync(root).find(name=>/^card\d+$/.test(name)&&fs.existsSync(path.join(root,name,'device/mem_info_gtt_used')));
if(!card)throw Error('No AMDGPU memory counters available on this host');
const read=name=>Number(fs.readFileSync(path.join(root,card,'device',name),'utf8'));
const started=performance.now(),samples=[];
do {
  const row={at:new Date().toISOString(),seconds:(performance.now()-started)/1000,gttBytes:read('mem_info_gtt_used'),vramBytes:read('mem_info_vram_used')};
  row.totalBytes=row.gttBytes+row.vramBytes;samples.push(row);
  const values=samples.map(s=>s.totalBytes);
  const result={scope:'device-wide',card,samples,minBytes:Math.min(...values),maxBytes:Math.max(...values),deltaBytes:values.at(-1)-values[0]};
  fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(row));
  const remaining=duration*1000-(performance.now()-started);
  if(remaining<=0)break;
  await delay(Math.min(5000,remaining));
}while(true);
