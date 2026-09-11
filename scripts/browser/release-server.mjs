import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
const types={'.js':'text/javascript; charset=utf-8','.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.wasm':'application/wasm','.txt':'text/plain; charset=utf-8','.wgsl':'text/plain'};
export function createReleaseHandler(root){
  const files=JSON.parse(fs.readFileSync(path.join(root,'files.json')));
  const allowed=new Map(files.filter(f=>(types[path.extname(f.path)]||/^source\/source\.tar\.gz\.part\d{3}$/.test(f.path))&&!['server.mjs'].includes(f.path)).map(f=>['/'+f.path,f]));
  return (req,res)=>{
    const headers={'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Cache-Control':'no-cache'};
    const end=(status,text)=>{res.writeHead(status,headers);res.end(req.method==='HEAD'?'':text);};
    if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');end(405,'Method not allowed');return;}
    let route;try{route=decodeURIComponent(new URL(req.url,'http://local').pathname);}catch{end(400,'Bad request');return;}
    if(route==='/health'){headers['Content-Type']='application/json';end(200,JSON.stringify({ok:true,engine:'browser',nativeWorkers:0}));return;}
    if(route==='/play'){res.writeHead(308,{...headers,Location:'/play/'});res.end();return;}
    if(route.endsWith('/'))route+='index.html';
    const file=allowed.get(route);if(!file){end(404,'Not found');return;}
    headers['Content-Type']=types[path.extname(file.path)]||'application/octet-stream';headers['Content-Length']=file.bytes;
    if(route.startsWith('/play/build/core-candidates/'))headers['Cache-Control']='public, max-age=31536000, immutable';
    res.writeHead(200,headers);if(req.method==='HEAD'){res.end();return;}
    const stream=fs.createReadStream(path.join(root,file.path));stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
  };
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  const root=path.resolve(process.env.MELEE_RELEASE_DIR||import.meta.dirname),port=Number(process.env.PORT||8080),host=process.env.HOST||'127.0.0.1';
  const server=createServer(createReleaseHandler(root));server.listen(port,host,()=>console.log(`Browser release: http://${host}:${port}`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
