import {createColorReference} from './color-reference.mjs';
export function verifyColors(module,converted,pointer) {
  const objects=module._portRuntimeObjectsUsed();let frames=0,reads=0,selections=0;const rows=[];
  for(const table of converted.colors.tables)for(const entry of table.entries) {
    const address=pointer(table.section),base=address-table.offset;
    const native=module._portColorCreate(address,table.entries.length,entry.index),reference=createColorReference(converted.archive,table,entry.index);
    if(!native)throw Error('Native color creation failed');
    const compare=frame=>{
      reference.values(base).forEach((expected,index)=>{
        const actual=module._portColorRead(native,index);reads++;
        if(!Object.is(actual,expected))throw Error(`Color state mismatch: table ${table.section}, entry ${entry.index}, frame ${frame}, field ${index}: ${actual} != ${expected}`);
      });
    };
    try {
      compare(-1);let ended=false,ran=0;
      for(let frame=0;frame<360;frame++) {
        const actual=Boolean(module._portColorStep(native)),expected=reference.step();frames++;ran++;
        if(actual!==expected)throw Error('Native color termination mismatch');compare(frame);
        if(actual){ended=true;break;}
      }
      rows.push({section:table.section,index:entry.index,frames:ran,ended,externalEvents:[...reference.state.events]});
      // Exercise the original priority gate and a finite lifetime when replacing
      // an existing color effect; lower-priority requests must leave state alone.
      for(const target of [0,1,table.entries.length-1]) {
        const actual=Boolean(module._portColorSelect(native,address,table.entries.length,target,3)),expected=reference.select(target,3);selections++;
        if(actual!==expected)throw Error('Color priority selection mismatch');compare(360+target);
        if(actual)for(let i=0;i<3;i++) {
          const nativeDone=Boolean(module._portColorStep(native)),referenceDone=reference.step();frames++;
          if(nativeDone!==referenceDone)throw Error('Color lifetime mismatch');compare(400+i);if(nativeDone)break;
        }
      }
    } finally {module._portColorDestroy(native);}
    if(module._portRuntimeObjectsUsed()!==objects)throw Error('Color state owner leaked');
  }
  return {passed:true,entries:rows.length,commands:converted.colors.scripts.commands.size,words:converted.colors.scripts.words.size,frames,reads,selections,rows,
    limitation:'Color state and control flow; GFX/SFX/rumble event words observed through original skip handlers, not emitted'};
}
