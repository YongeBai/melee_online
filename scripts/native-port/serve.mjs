import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
const output=path.resolve(import.meta.dirname,'../../dist/native-port');
const port=Number(process.env.MELEE_NATIVE_PORT||3324);
const files=new Set(['stage-map.html','stage-map-assets.mjs','verify-stage-map.mjs','effect-fixtures.json','effect-assets.mjs','verify-effects.mjs','tev-shader.mjs','tev-reference.mjs','verify-tev.mjs','tev-check.html','tev-fixtures.json','native-tev.mjs','native-texture.mjs','native-pixel.mjs','native-model.mjs','native-render-context.mjs','material-shader.mjs','material-gpu.mjs','verify-material-shader.mjs','verify-model-state.mjs','verify-material-state.mjs','native-match-preview.mjs','native-live.mjs','combat-workload.mjs','native-camera.mjs','verify-combat.mjs','verify-match.mjs','player-parameters.mjs','status-assets.mjs','constructor.html','fighter-base-assets.mjs','item-model-assets.mjs','verify-item-models.mjs','secondary-animation-assets.mjs','verify-secondary-animation.mjs','gameplay-assets.mjs','verify-gameplay.mjs','verify-fighter-animation.mjs','dynamics-assets.mjs','verify-dynamics.mjs','fighter-init-assets.mjs','verify-fighter-init.mjs','fighter-init.html','melee-fighter-init.mjs','melee-fighter-init.wasm','startup.html','verify-startup.mjs','melee-startup.mjs','melee-startup.wasm','costume-assets.mjs','animation-object-assets.mjs','material-animation-assets.mjs','verify-material-animation.mjs','visibility-assets.mjs','auxiliary-assets.mjs','verify-lights.mjs','attribute-assets.mjs','verify-attributes.mjs','character-collision-assets.mjs','verify-character-collision.mjs','verify-common-initialization.mjs','joint-animation-assets.mjs','cpu-assets.mjs','verify-cpu.mjs','color-assets.mjs','color-reference.mjs','verify-colors.mjs','shared-fixtures.json','shared-spec.mjs','attribute-spec.mjs','shared-assets.mjs','verify-shared.mjs','verify-commands.mjs','command-fields.mjs','motion-spec.mjs','motion-assets.mjs','motion-animations.mjs','verify-motions.mjs','resident-files.mjs','verify-resident-files.mjs','index.html','melee-native.mjs','melee-native.wasm','melee-scene.mjs','melee-scene.wasm','scene-build.json','archive.mjs','scene-assets.mjs','verify-scene.mjs','scene.html',
  'stage-collision.mjs','fighter-assets.mjs','verify-fighters.mjs','animation-assets.mjs','verify-animations.mjs','math-reference.mjs','verify-math.mjs','verify.mjs','verify-runtime.mjs',
  'joint-assets.mjs','verify-poses.mjs','mesh-assets.mjs','verify-meshes.mjs','skin-assets.mjs','verify-skin.mjs','material-assets.mjs','texture.mjs','texture-matrix.mjs','gpu-mesh.mjs','verify-gpu-conventions.mjs','gpu-preview.mjs','gpu-preview.html','estimate-vectors.mjs','model-fixtures.json',
  'stage-fixtures.json','fighter-fixtures.json','animation-fixtures.json','build.json']);
for(const manifestName of ['effect-fixtures.json','shared-fixtures.json','stage-fixtures.json','fighter-fixtures.json','animation-fixtures.json','model-fixtures.json']) {
const manifest=path.join(output,manifestName);
if(fs.existsSync(manifest))for(const name of JSON.parse(fs.readFileSync(manifest))) {
  if(name!=='PdPm.dat'&&name!=='IfAll.usd'&&!/^(Gr|Pl|Ef)[A-Za-z0-9]+\.(dat|usd)$/.test(name))throw Error('Invalid fixture filename');
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
