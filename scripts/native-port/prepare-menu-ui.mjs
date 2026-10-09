import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'dist/native-port');
export async function prepareMenuUI(assetRoot=path.join(root,'.melee-assets')){
 fs.mkdirSync(path.join(out,'vendor'),{recursive:true});fs.mkdirSync(path.join(out,'assets'),{recursive:true});
 fs.writeFileSync(path.join(out,'melee-ui.css'),fs.readFileSync(path.join(root,'scripts/engine/melee-ui.css'),'utf8').replaceAll('/play/assets/','./assets/'));
 for(const file of ['keyboard-model.js','controller-model.js','gamecube-buttons.js'])fs.copyFileSync(path.join(root,'scripts/engine',file),path.join(out,file));
 for(const file of ['three.module.js','three.core.js'])if(fs.existsSync(path.join(root,'web/node_modules/three/build',file)))fs.copyFileSync(path.join(root,'web/node_modules/three/build',file),path.join(out,'vendor',file));
 if(!fs.existsSync(assetRoot))throw Error('Prepare extracted native menu UI assets first');
 const names=fs.readdirSync(assetRoot).filter(n=>/^(glyph-\d+|room-[a-z-]+|tap-jump|on|off|back|MnSlMap-860|MnSlChr-2f740|MnMaAll-(18580|f2c0|1bf200))\.png$/.test(n));
 for(const file of names)fs.copyFileSync(path.join(assetRoot,file),path.join(out,'assets',file));
 if(fs.existsSync(path.join(assetRoot,'MnSlMap-35320.png'))){await favicon(path.join(assetRoot,'MnSlMap-35320.png'),path.join(out,'assets/favicon.png'));names.push('favicon.png');}
 fs.writeFileSync(path.join(out,'ui-fixtures.json'),JSON.stringify(names));return names;
}
// The tab icon is the Smash Bros. emblem from the stage-select series icons
// (a dim intensity texture, brought up to full white) on a black disc so it
// reads on light and dark tab strips.
async function favicon(from,to){
 const sharp=createRequire(path.join(root,'web/package.json'))('sharp'),size=64,inner=50;
 const {data,info}=await sharp(from).resize(inner,inner,{kernel:'lanczos3'}).raw().toBuffer({resolveWithObject:true});
 let peak=1;for(let i=3;i<data.length;i+=info.channels)peak=Math.max(peak,data[i]);
 const emblem=Buffer.alloc(inner*inner*4);
 for(let i=0;i<inner*inner;i++){emblem.fill(255,i*4,i*4+3);emblem[i*4+3]=Math.min(255,Math.round(data[i*info.channels+3]*255/peak));}
 const disc=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="#000"/></svg>`);
 await sharp(disc).composite([{input:emblem,raw:{width:inner,height:inner,channels:4},left:(size-inner)/2,top:(size-inner)/2}]).png().toFile(to);
}
if(process.argv[1]===import.meta.filename)await prepareMenuUI(process.argv.find(s=>s.startsWith('--assets='))?.slice(9));
