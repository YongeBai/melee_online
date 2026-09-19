import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WebSocket} from '../../web/node_modules/ws/wrapper.mjs';
import {webAccess} from '../native/web-server.mjs';
import {createNativePortServer,nativePortFile} from './serve.mjs';
import {releaseConfiguration} from './release-server.mjs';

test('product routing exposes one game entry and preserves diagnostic routing by default',()=>{
 assert.equal(nativePortFile('/'), 'index.html');
 assert.equal(nativePortFile('/play/',{productEntry:true}),'character-menu.html');
 assert.equal(nativePortFile('/play/native-live.mjs',{productEntry:true}),'native-live.mjs');
 assert.equal(nativePortFile('/audio/victory.hps',{productEntry:true}),'audio/victory.hps');
 assert.equal(nativePortFile('/play/certification.html',{productEntry:true}),null);
 assert.equal(nativePortFile('/index.html',{productEntry:true}),null);
 assert.equal(nativePortFile('/secret.iso',{productEntry:true}),null);
});

test('release configuration fails closed for external and malformed endpoints',()=>{
 assert.throws(()=>releaseConfiguration({MELEE_PORT:'nope'}),/MELEE_PORT/);
 assert.throws(()=>releaseConfiguration({MELEE_BIND_HOST:'0.0.0.0'}),/HTTPS/);
 assert.throws(()=>releaseConfiguration({MELEE_BIND_HOST:'0.0.0.0',MELEE_PUBLIC_ORIGIN:'http://game.test',MELEE_ACCESS_KEY:'x'.repeat(24)}),/HTTPS/);
 assert.throws(()=>releaseConfiguration({MELEE_PUBLIC_ORIGIN:'https://game.test/'}),/without a trailing slash/);
 const config=releaseConfiguration({MELEE_PORT:'4321'});assert.deepEqual(config.origins,['http://localhost:4321','http://127.0.0.1:4321']);
});

test('product server privately serves the hosted no-ISO entry with isolation headers',async t=>{
 const outputDir=fs.mkdtempSync(path.join(os.tmpdir(),'native-port-release-'));
 fs.mkdirSync(path.join(outputDir,'audio'));fs.writeFileSync(path.join(outputDir,'character-menu.html'),'<html>tournament</html>');fs.writeFileSync(path.join(outputDir,'native-live.mjs'),'export{}');fs.writeFileSync(path.join(outputDir,'audio/victory.hps'),'music');fs.writeFileSync(path.join(outputDir,'certification.html'),'diagnostic');
 const access=webAccess({key:'fixture-key'}),allowedFiles=new Set(['character-menu.html','native-live.mjs','audio/victory.hps','certification.html']),server=createNativePortServer({enableRooms:false,productEntry:true,access,outputDir,allowedFiles});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(outputDir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/play/')).status,401);
 const authed=await fetch(base+'/play/',{headers:{Authorization:'Basic '+Buffer.from('player:fixture-key').toString('base64')}}),cookie=authed.headers.get('set-cookie').split(';')[0],headers={cookie};
 assert.equal(await authed.text(),'<html>tournament</html>');assert.equal(authed.headers.get('cross-origin-embedder-policy'),'require-corp');
 assert.equal((await fetch(base+'/play/native-live.mjs',{headers})).status,200);assert.equal((await fetch(base+'/audio/victory.hps',{headers})).status,200);
 for(const route of ['/play/certification.html','/certification.html','/secret.iso','/play/%2e%2e%2fsecret.iso'])assert.equal((await fetch(base+route,{headers})).status,404);
 const redirect=await fetch(base+'/?join=ABC234',{headers,redirect:'manual'});assert.equal(redirect.status,302);assert.equal(redirect.headers.get('location'),'/play/?join=ABC234');
 const health=await fetch(base+'/health',{headers});assert.deepEqual(await health.json(),{engine:'browser-native-wasm',dolphin:false,rooms:false,width:960,height:720});
});

test('room relay requires configured access and exact browser origin',async t=>{
 const access=webAccess({key:'fixture-key'}),server=createNativePortServer({productEntry:true,access,roomOptions:{authorize:access.authorized,origins:['https://game.test']}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/native-rooms',{method:'POST',body:'{}'})).status,401);
 const login=await fetch(base+'/health',{headers:{Authorization:'Basic '+Buffer.from('player:fixture-key').toString('base64')}}),cookie=login.headers.get('set-cookie').split(';')[0];
 assert.equal((await fetch(base+'/native-rooms',{method:'POST',headers:{cookie,Origin:'https://wrong.test'},body:'{}'})).status,403);
 const created=await fetch(base+'/native-rooms',{method:'POST',headers:{cookie,Origin:'https://game.test'},body:'{}'});assert.equal(created.status,200);const room=await created.json();
 const rejected=new WebSocket(base.replace('http','ws')+'/native-room',{headers:{cookie,Origin:'https://wrong.test'}});await new Promise(resolve=>rejected.on('error',resolve));
 const accepted=new WebSocket(base.replace('http','ws')+'/native-room',{headers:{cookie,Origin:'https://game.test'}});await new Promise((resolve,reject)=>{accepted.on('open',resolve);accepted.on('error',reject);});accepted.send(JSON.stringify({type:'hello',token:room.token}));await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Missing authenticated room state')),1000);accepted.on('message',raw=>{if(JSON.parse(raw).type==='state'){clearTimeout(timeout);resolve();}});});accepted.close();
});
