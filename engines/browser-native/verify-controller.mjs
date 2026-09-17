// Exercise real HSD samples and original fighter input/state callbacks. Never
// assign fighter positions, actions, damage, trigger values or c-stick fields.
export function verifyControllerInput(module,objects,report,{step,onStep=()=>{}}){
  const require=(ok,message)=>{if(!ok)throw Error('Native controller: '+message);};
  const read=()=>objects.map(o=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(o,i)));
  const input=o=>Array.from({length:20},(_,i)=>module._portFighterInitRead(o,24,i));
  const neutral=[0,0,0,0,0,0,0];let phase='settle';
  Object.assign(report,{completed:false,frames:0,trace:[],retailParityVerified:false});
  const stocks=read().map(s=>s[18]);
  function tick(sample=neutral){objects.forEach((o,i)=>module._portControllerSample(i,...(i?neutral:sample)));step();report.frames++;const states=read(),inputs=objects.map(input);require(states.flat().every(Number.isFinite)&&inputs.flat().every(Number.isFinite),'finite state/input');require(states.every((s,i)=>s[18]===stocks[i]),'unchanged stocks');const row={phase,sample:sample.slice(),states,inputs};report.trace.push(row);onStep(row);return row;}
  function settle(){for(let i=0;i<120;i++)tick();require(read()[0][0]===14&&read()[0][3]===0,'grounded neutral recovery');}
  objects.forEach((o,i)=>module._Player_80031848(i));settle();
  for(const [name,cx,cy,state]of [['forward',1,0,60],['up',0,1,63],['down',0,-1,64]]){
    phase='c-stick '+name;const start=report.trace.length;tick([0,0,0,cx,cy,0,0]);settle();const rows=report.trace.slice(start);
    require(rows.some(r=>r.states[0][0]===state),'original '+name+' smash');require(rows[0].inputs[0][6]===cx&&rows[0].inputs[0][7]===cy,'exact c-stick direction');require(rows.every(r=>!(r.sample[0]&0x100)),'C-stick requires no injected A button');require(rows.at(-1).inputs[0][6]===0&&rows.at(-1).inputs[0][7]===0,'c-stick release');
  }
  for(const [name,buttons,l,r]of [['left soft',0,.35,0],['right soft',0,0,.65],['digital',0x40,1,0]]){
    phase=name+' shield';const start=report.trace.length;for(let i=0;i<15;i++)tick([buttons,0,0,0,0,l,r]);const rows=report.trace.slice(start),last=rows.at(-1);
    require(rows.some(t=>[178,179].includes(t.states[0][0])),'original shield state');require(Math.abs(last.inputs[0][12]-Math.max(l,r))<1e-6,'exact shoulder pressure');require((last.inputs[0][15]&0x60)===buttons,'analog pressure distinct from digital click');settle();
  }
  phase='release';const end=tick();require(end.inputs.every(i=>i[6]===0&&i[7]===0&&i[12]===0&&i[15]===0),'neutral clears both controllers');report.completed=true;
}
