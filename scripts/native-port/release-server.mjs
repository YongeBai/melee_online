import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {webAccess} from '../native/web-server.mjs';
import {createNativePortServer} from './serve.mjs';

export function releaseConfiguration(env=process.env){
 const host=env.MELEE_BIND_HOST||'127.0.0.1',port=Number(env.MELEE_PORT||3000),publicOrigin=env.MELEE_PUBLIC_ORIGIN||'',accessKey=env.MELEE_ACCESS_KEY||'';
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('MELEE_PORT must be an integer from 1 to 65535');
 if(publicOrigin&&new URL(publicOrigin).origin!==publicOrigin)throw Error('MELEE_PUBLIC_ORIGIN must be an origin without a trailing slash');
 const external=!['127.0.0.1','localhost','::1'].includes(host)||(publicOrigin&&!['localhost','127.0.0.1','[::1]'].includes(new URL(publicOrigin).hostname));
 if(external&&(!publicOrigin.startsWith('https://')||accessKey.length<24))throw Error('A public server requires an HTTPS MELEE_PUBLIC_ORIGIN and a 24+ character MELEE_ACCESS_KEY');
 const localOrigins=[`http://localhost:${port}`,`http://127.0.0.1:${port}`];
 return {host,port,publicOrigin,accessKey,origins:publicOrigin?[publicOrigin]:localOrigins};
}

export function createReleaseServer(env=process.env){
 const config=releaseConfiguration(env),access=webAccess({key:config.accessKey,secure:config.publicOrigin.startsWith('https://')});
 return {config,server:createNativePortServer({productEntry:true,access,roomOptions:{authorize:access.authorized,origins:config.origins}})};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const {config,server}=createReleaseServer();
 server.listen(config.port,config.host,()=>console.log(`Native WASM tournament server: ${config.publicOrigin||`http://${config.host}:${config.port}`}/play/`));
}
