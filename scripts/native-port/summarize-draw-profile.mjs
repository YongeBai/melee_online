import fs from 'node:fs';
import path from 'node:path';

// CPU samples only. Inclusive rows overlap; these are not GPU execution times.
export function summarizeDrawProfile(profile){
 const nodes=new Map(profile.nodes.map(n=>[n.id,n])),parents=new Map();
 for(const n of profile.nodes)for(const child of n.children??[])parents.set(child,n.id);
 const key=n=>{const f=n.callFrame;return `${f.url.split('/').at(-1)||'(browser)'}:${f.lineNumber+1} ${f.functionName||'(anonymous)'}`;};
 const self=new Map(),inclusive=new Map(),stages={nativeTraversalAndCapture:0,uniformsAndTextures:0,uniformBufferStagingAndSubmission:0,otherFlush:0,otherDraw:0};let samples=0,drawMs=0,totalMs=0;const outsideDraw={garbageCollectorMs:0,idleMs:0,otherMs:0};
 for(let i=0;i<profile.samples.length;i++){
  const dt=profile.timeDeltas[i]/1000,stack=[];totalMs+=dt;
  for(let id=profile.samples[i];id;id=parents.get(id))stack.push(nodes.get(id));
  if(!stack.some(n=>n.callFrame.functionName==='drawFrame'&&n.callFrame.url.endsWith('/certification.mjs'))){const name=stack[0].callFrame.functionName;outsideDraw[name==='(garbage collector)'?'garbageCollectorMs':name==='(idle)'?'idleMs':'otherMs']+=dt;continue;}
  samples++;drawMs+=dt;const leaf=key(stack[0]);self.set(leaf,(self.get(leaf)??0)+dt);
  for(const k of new Set(stack.map(key)))inclusive.set(k,(inclusive.get(k)??0)+dt);
  const has=(file,fn)=>stack.some(n=>n.callFrame.url.endsWith('/'+file)&&n.callFrame.functionName===fn);
  const stage=stack.some(n=>n.callFrame.url.endsWith('/draw-uniform-buffer.mjs'))?'uniformBufferStagingAndSubmission':has('material-gpu.mjs','apply')?'uniformsAndTextures':has('material-gpu.mjs','flush')?'otherFlush':stack.some(n=>n.callFrame.url.includes('wasm:'))?'nativeTraversalAndCapture':'otherDraw';stages[stage]+=dt;
 }
 const sourceSelf=new Map();for(const [location,ms]of self){const source=location.split(':')[0];sourceSelf.set(source,(sourceSelf.get(source)??0)+ms);}
 const functions=['writeDrawUniforms','generateMaterialShaders','materialShaderKey','packRows','equalTextureBytes'];
 const functionSelfMs=Object.fromEntries(functions.map(name=>[name,[...self].filter(([location])=>location.endsWith(' '+name)).reduce((sum,[,ms])=>sum+ms,0)]));
 const rows=map=>[...map].sort((a,b)=>b[1]-a[1]).slice(0,40).map(([functionLocation,cpuMs])=>({functionLocation,cpuMs,percentOfDraw:cpuMs/drawMs*100}));
 return {scope:'CPU sampling under timed drawFrame only; includes native traversal/capture and WebGL submission, excludes final pixel oracle. Inclusive rows overlap. Not GPU elapsed time; profiling adds overhead. UBO texture/sampler submission outside apply remains in otherFlush; use drawStages for the measured substage breakdown.',totalProfileMs:totalMs,outsideDraw,drawSamples:samples,sampledDrawMs:drawMs,stages,sourceSelfMs:Object.fromEntries([...sourceSelf].sort((a,b)=>b[1]-a[1])),functionSelfMs,self:rows(self),inclusive:rows(inclusive)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===import.meta.filename){
 const directory=process.argv[2];if(!directory)throw Error('Usage: node summarize-draw-profile.mjs <certification-output-directory>');
 const clients=fs.readdirSync(directory).filter(f=>/^cpu-\d+\.json$/.test(f)).sort().map(file=>({file,...summarizeDrawProfile(JSON.parse(fs.readFileSync(path.join(directory,file))).profile)}));
 console.log(JSON.stringify({clients},null,2));
}
