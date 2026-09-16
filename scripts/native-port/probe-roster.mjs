// Sequential constructor/input regression after changes shared by all fighters.
// Covers every fighter selection; this is not a move-parity or FPS test.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'dist/native-port');
const codes=['Ca','Dk','Ms','Gn','Fe','Fx','Fc','Pr','Mr','Lg','Dr','Pk','Pc','Ss','Kp','Lk','Cl','Ys','Mt','Gw','Ns','Sk','Zd','Pe','Pp','Kb'];
const report={scope:'Original constructors and scripted walk/jump/aerial/recovery, with live numeric motion-word checks',
  build:JSON.parse(fs.readFileSync(path.join(out,'fighter-init-build.json'))),excluded:[],rows:[],passed:false,gameplayParity:false,performanceMeasured:false};
for(const code of codes){
  const log=fs.openSync(path.join(out,'roster-'+code+'.log'),'w');let result;
  try{result=spawnSync(process.execPath,[path.join(import.meta.dirname,'probe-constructor.mjs'),'--character='+code,'--input'],{cwd:root,stdio:['ignore',log,log],timeout:60000});}
  finally{fs.closeSync(log);}
  let row={code,passed:false};
  if(result.status!==0)row.error=result.error?.message??'Probe exited '+result.status+'; see roster-'+code+'.log';
  else{
    const p=JSON.parse(fs.readFileSync(path.join(out,'last-constructor-probe.json')));
    Object.assign(row,{passed:!p.error&&p.constructorVerified&&p.input?.completed&&p.input.motionWordChecks===142,
      frames:p.input?.frames,motionWordChecks:p.input?.motionWordChecks,moveIds:p.input?.moveIds,states:p.input?.states,forms:p.fighterForms});
  }
  report.rows.push(row);console.log(code+': '+(row.passed?'passed':row.error??'incomplete'));
  fs.writeFileSync(path.join(out,'roster-input-regression.json'),JSON.stringify(report,null,2)+'\n');
}
report.passed=report.rows.every(row=>row.passed);
fs.writeFileSync(path.join(out,'roster-input-regression.json'),JSON.stringify(report,null,2)+'\n');
if(!report.passed)process.exitCode=1;
