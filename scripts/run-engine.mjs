import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
const cwd = fileURLToPath(new URL('../engines/wasm-dolphin/',import.meta.url));
if (!existsSync(cwd)) throw new Error('Run node scripts/setup-engine.mjs first.');
const child = spawn(process.execPath,['tools/serve.mjs',process.argv[2] || '3001'],{cwd,stdio:'inherit'});
child.on('exit',code=>{process.exitCode=code ?? 1;});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>child.kill(signal));
