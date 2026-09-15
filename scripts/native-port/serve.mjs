import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
const output=path.resolve(import.meta.dirname,'../../dist/native-port');
const port=Number(process.env.MELEE_NATIVE_PORT||3324);
const files=new Set(['index.html','melee-native.mjs','melee-native.wasm','melee-scene.mjs','melee-scene.wasm','scene-build.json','archive.mjs','scene-assets.mjs','verify-scene.mjs','scene.html',
  'stage-collision.mjs','fighter-assets.mjs','verify-fighters.mjs','animation-assets.mjs','verify-animations.mjs','math-reference.mjs','verify-math.mjs','verify.mjs','verify-runtime.mjs',
  'joint-assets.mjs','verify-poses.mjs','mesh-assets.mjs','verify-meshes.mjs','skin-assets.mjs','verify-skin.mjs','material-assets.mjs','texture.mjs','texture-matrix.mjs','gpu-mesh.mjs','verify-gpu-conventions.mjs','gpu-preview.mjs','gpu-preview.html','estimate-vectors.mjs','model-fixtures.json',
  'stage-fixtures.json','fighter-fixtures.json','animation-fixtures.json','build.json']);
for(const manifestName of ['stage-fixtures.json','fighter-fixtures.json','animation-fixtures.json','model-fixtures.json']) {
const manifest=path.join(output,manifestName);
if(fs.existsSync(manifest))for(const name of JSON.parse(fs.readFileSync(manifest))) {
  if(!/^(Gr|Pl)[A-Za-z0-9]+\.(dat|usd)$/.test(name))throw Error('Invalid fixture filename');
  files.add('fixtures/'+name);
}
}
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json'};
export function createNativePortServer() { return createServer((req,res)=> {
  const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(!files.has(name)||!fs.existsSync(path.join(output,name))){res.writeHead(404).end();return;}
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
  res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream',
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  if(req.method==='HEAD')res.end();else fs.createReadStream(path.join(output,name)).pipe(res);
}); }
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)
  createNativePortServer().listen(port,'127.0.0.1',()=>console.log(`Native-port subsystem verification: http://127.0.0.1:${port}/`));
