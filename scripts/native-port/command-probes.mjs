// Generate access through the actual C fields. The JS verifier extracts and
// inserts bits arithmetically rather than reproducing native bitfield layout.
export function commandProbeSource(fields) {
  const expression=f=>`((${({command:'CmdUnion',dispatch:'gmScriptEventDefault',motion:'struct ftData_80085FD4_ret',color:'union ColorOverlay_x8_t',skip:'struct spawn_hitbox_skip'})[f.view]}*)words)->${f.path}`;
  return '#include <melee/lb/types.h>\n#include <melee/ft/types.h>\n#include <stdlib.h>\n'+
    `unsigned portCommandFieldCount(void){return ${fields.length};}\n`+
    'double portCommandFieldRead(unsigned index,const u32* words){switch(index){\n'+
    fields.map((f,i)=>`case ${i}: return ${expression(f)};`).join('\n')+
    '\ndefault: abort();}}\n'+
    'void portCommandFieldWrite(unsigned index,u32* words,double value){switch(index){\n'+
    fields.map((f,i)=>`case ${i}: ${expression(f)}=value; return;`).join('\n')+
    '\ndefault: abort();}}\n';
}
