import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const run=promisify(execFile),root=path.resolve(import.meta.dirname,'../..');
const framesArg=process.argv.find(arg=>arg.startsWith('--frames=')),frames=Number(framesArg?.slice('--frames='.length)??60);
if(!Number.isSafeInteger(frames)||frames<1||frames>1800)throw Error('--frames must be between 1 and 1800');
const stages=[31,32,28,8,2,3],cases=Array.from({length:25},(_,i)=>({pair:[i,10],stage:stages[i%stages.length],holdASeat:null}));
cases.push({pair:[15,12],stage:stages.at(-1),holdASeat:0});
const output=path.join(root,'dist/native-port/experiment-native-room-matrix'),partialPath=path.join(output,'partial.json');fs.mkdirSync(output,{recursive:true});
let rows=[];if(process.argv.includes('--resume')&&fs.existsSync(partialPath)){const partial=JSON.parse(fs.readFileSync(partialPath));if(partial.framesPerCase!==frames)throw Error('Saved matrix uses a different frame count');rows=partial.rows;}
for(const [index,entry] of cases.entries()){
 if(rows[index]?.index===index){console.log(JSON.stringify({...rows[index],resumed:true}));continue;}
 if(rows.length!==index)throw Error('Saved matrix rows are not a contiguous prefix');
 const args=['scripts/native-port/probe-native-rooms.mjs','--rollback','--frames='+frames,'--pair='+entry.pair.join(','),'--stage='+entry.stage];if(entry.holdASeat!==null)args.push('--hold-a-seat='+entry.holdASeat);
 const {stdout}=await run(process.execPath,args,{cwd:root,timeout:180000,maxBuffer:1024*1024});
 const result=JSON.parse(stdout.trim().split('\n').at(-1)),report=JSON.parse(fs.readFileSync(path.join(root,'dist/native-port/experiment-native-rooms-rollback/report.json'))),first=report.final[0].report;
 if(!result.passed||!report.passed||first.selection.seconds!==480||first.selection.items!==-1||first.selection.teams!==0||first.selection.mode!==1||first.selection.timer!==1||report.final.some(v=>v.report.live.frames!==frames||v.report.live.draws!==frames||v.report.rollback.metrics.session.confirmed!==frames-1)||JSON.stringify(report.final[0].report.live.final)!==JSON.stringify(report.final[1].report.live.final))throw Error('Tournament room matrix case failed '+JSON.stringify({index,entry,result}));
 const row={index,pair:entry.pair,stage:entry.stage,stageName:first.stage.name,holdASeat:entry.holdASeat,selection:first.selection.players.slice(0,2),initialKinds:first.live.initial.map(v=>v[11]),fighterForms:first.fighterForms.map(v=>({slot:v.slot,index:v.index,code:v.code})),frames:first.live.frames,draws:first.live.draws,confirmed:report.final.map(v=>v.report.rollback.metrics.session.confirmed),matchingFighterState:true};rows.push(row);fs.writeFileSync(partialPath,JSON.stringify({framesPerCase:frames,rows},null,2));console.log(JSON.stringify(row));
}
const rosterTiles=new Set(rows.slice(0,25).map(r=>r.pair[0])),legalStages=new Set(rows.map(r=>r.stage)),sheik=rows.at(-1);
if(rosterTiles.size!==25||legalStages.size!==6||sheik.holdASeat!==0||sheik.initialKinds[0]!==7||!sheik.fighterForms.some(v=>v.slot===0&&v.code==='Sk'))throw Error('Tournament matrix coverage incomplete');
const report={passed:true,framesPerCase:frames,cases:rows.length,rosterTiles:rosterTiles.size,playableStarts:26,legalStages:[...legalStages].sort((a,b)=>a-b),rows,scope:'Two localhost product-room browsers; native hand/token selection, fixed tournament rules, opt-in rollback confirmation and exact final fighter state. Short loading/correctness matrix, not sustained presentation, exhaustive matchup, WAN, input-to-photon or tournament certification.'};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,cases:rows.length,rosterTiles:rosterTiles.size,playableStarts:26,legalStages:report.legalStages}));
