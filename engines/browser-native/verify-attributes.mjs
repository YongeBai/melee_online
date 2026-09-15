import {attributeSpec} from './attribute-spec.mjs';
import {convertSpecialAttributes} from './attribute-assets.mjs';

// Independent list of fields scaled by the original LoadSpecialAttrs callbacks.
// Clone callbacks delegate, so their source and reference use the parent shape.
function scales(type,name) {
  if(type==='ftLk_DatAttrs')return name==='specialhi_pos_y_offset';
  if(type==='ftPikachuAttributes')return name.startsWith('height_attributes.');
  if(type==='ftSs_DatAttrs')return ['x8','x74_vec.y','x54','x58'].includes(name)||name.startsWith('height_attributes.');
  if(type==='ftMewtwoAttributes')return ['x80_MEWTWO_DISABLE_OFFSET_X','x84_MEWTWO_DISABLE_OFFSET_Y'].includes(name);
  return false;
}
export function verifyAttributes(module,files) {
  const rows=[];let fieldReads=0,copies=0,scaledFields=0;
  for(const {name,bytes} of files) {
    const imported=convertSpecialAttributes(bytes,name,attributeSpec),{record,character}=imported;
    const source=module._malloc(record.size),output=module._malloc(record.size);
    try {
      module.HEAPU8.set(imported.bytes,source);
      const reference=new DataView(imported.bytes.buffer);
      if(module._portAttributeSize(character.kind)!==record.size)throw Error('Native attribute size mismatch');
      for(const [i,f] of record.fields.entries()) {
        const method=f.width===4?'getUint32':f.width===2?'getUint16':'getUint8',expected=reference[method](f.offset,true);
        if((module._portAttributeField(source,character.record,i)>>>0)!==expected)throw Error('Native attribute field mismatch: '+name+'/'+f.name);fieldReads++;
        const probe=f.width===4?0x3fa12345:f.width===2?0xa123:0xa1;
        new DataView(module.HEAPU8.buffer)[method.replace('get','set')](source+f.offset,probe,true);
        if((module._portAttributeField(source,character.record,i)>>>0)!==probe)throw Error('Native attribute field access mismatch');fieldReads++;
        module.HEAPU8.set(imported.bytes.subarray(f.offset,f.offset+f.width),source+f.offset);
      }
      const scaling=record.fields.filter(f=>scales(record.type,f.name));
      for(const scale of [1,0.5,1.5,2,1]) {
        module.HEAPU8.fill(0xa5,output,output+record.size);
        if(module._portAttributesLoad(character.kind,source,output,record.size,scale)!==0)throw Error('Original attribute loader rejected');
        const expected=imported.bytes.slice(),view=new DataView(expected.buffer);
        if(scale!==1)for(const field of scaling) {
          if(field.kind!=='float')throw Error('Scaled attribute must be float');
          view.setFloat32(field.offset,Math.fround(view.getFloat32(field.offset,true)*scale),true);scaledFields++;
        }
        // Compare named fields, including explicitly declared byte padding.
        // Compiler-inserted tail padding is not part of C struct assignment.
        for(const f of record.fields)for(let j=0;j<f.width;j++)if(module.HEAPU8[output+f.offset+j]!==expected[f.offset+j])throw Error('Original attribute copy/scale mismatch: '+name+'/'+f.name+'/'+scale);
        if(module.HEAPU8.subarray(source,source+record.size).some((v,i)=>v!==imported.bytes[i]))throw Error('Original loader modified source attributes');
        copies++;
      }
      rows.push({name,kind:character.kind,type:record.type,bytes:record.size,fields:record.fields.length,scaledFields:scaling.map(f=>f.name),copies:5});
    } finally {module._free(source);module._free(output);}
  }
  return {passed:true,rows,fieldReads,copies,scaledFields,recordTypes:attributeSpec.records.length,
    limitation:'Original per-character parameter copies and scale adjustments; OnLoad item registration and full Fighter_Create are not executed'};
}
