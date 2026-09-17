import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'dist/native-port');
export function prepareMenuUI(assetRoot=path.join(root,'.melee-assets')){
 fs.mkdirSync(path.join(out,'vendor'),{recursive:true});fs.mkdirSync(path.join(out,'assets'),{recursive:true});
 for(const file of ['keyboard-model.js','gamecube-buttons.js'])fs.copyFileSync(path.join(root,'scripts/engine',file),path.join(out,file));
 for(const file of ['three.module.js','three.core.js'])if(fs.existsSync(path.join(root,'web/node_modules/three/build',file)))fs.copyFileSync(path.join(root,'web/node_modules/three/build',file),path.join(out,'vendor',file));
 if(!fs.existsSync(assetRoot))throw Error('Prepare extracted native menu UI assets first');
 const names=fs.readdirSync(assetRoot).filter(n=>/^(glyph-\d+|room-[a-z-]+|tap-jump|on|off|back|MnSlMap-860|MnMaAll-(18580|f2c0|1bf200))\.png$/.test(n));
 for(const file of names)fs.copyFileSync(path.join(assetRoot,file),path.join(out,'assets',file));
 fs.writeFileSync(path.join(out,'ui-fixtures.json'),JSON.stringify(names));return names;
}
if(process.argv[1]===import.meta.filename)prepareMenuUI(process.argv.find(s=>s.startsWith('--assets='))?.slice(9));
