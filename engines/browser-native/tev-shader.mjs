// Copyright 2008 Dolphin Emulator Project
// SPDX-License-Identifier: GPL-2.0-or-later
// Integer combiner semantics adapted from PixelShaderGen.cpp at
// dolphin-emu/dolphin a2efdf1197be8132674b90fe9cf4761df39752ed.
// License: vendor/dolphin/GPL-2.0-or-later.txt. See TEV-NOTES.md for scope and provenance.
import {explicitTevStages} from './native-tev.mjs';

export const defaultTevSwaps=Object.freeze(['rgba','rrra','ggga','bbba']);
const fractions=[255,223,191,159,128,96,64,32];
function constant(sel,alpha) {
  let value;
  if(sel<8)value=String(fractions[sel]);
  else if(sel<12||(alpha&&sel<16))value='0';
  else if(sel<16)return `tevKonst[${sel-12}].rgb`;
  else value=`tevKonst[${sel%4}].${'rgba'[Math.floor((sel-16)/4)]}`;
  return alpha?value:`ivec3(${value})`;
}
const colorInputs=['r[0].rgb','r[0].aaa','r[1].rgb','r[1].aaa','r[2].rgb','r[2].aaa','r[3].rgb','r[3].aaa',
  't.rgb','t.aaa','v.rgb','v.aaa','ivec3(255)','ivec3(128)','k.rgb','ivec3(0)'];
const alphaInputs=['r[0].a','r[1].a','r[2].a','r[3].a','t.a','v.a','k.a','0'];
function comparison(op,component) {
  const mode=(op-8)>>1,operator=op%2?'==':'>';
  const packed=v=>mode===0?`${v}.r`:mode===1?`(${v}.r+(${v}.g<<8))`:`(${v}.r+(${v}.g<<8)+(${v}.b<<16))`;
  if(mode===3&&component==='rgb')return `ivec3(${['r','g','b'].map(c=>`a.${c}${operator}b.${c}?c.${c}:0`).join(',')})`;
  const left=mode===3?'a.a':packed('a'),right=mode===3?'b.a':packed('b');
  return `(${left}${operator}${right}?c.${component}:${component==='rgb'?'ivec3(0)':'0'})`;
}
function combine(s,alpha) {
  const at=alpha?13:4,op=s[at],bias=s[at+1],scale=s[at+2],clamp=s[at+3],component=alpha?'a':'rgb';
  let expression;
  if(op>=8)expression=`d.${component}+${comparison(op,component)}`;
  else {
    const shift=scale===3?0:scale,round=scale===3?0:op===0?128:127;
    const offset=[0,128,-128][bias];
    expression=`(((d.${component}+${offset})<<${shift})${op===0?'+':'-'}((((a.${component}<<8)+(b.${component}-a.${component})*(c.${component}+(c.${component}>>7)))<<${shift})+${round}>>8))`;
    if(scale===3)expression=`(${expression}>>1)`;
  }
  return `clamp(${expression},${clamp?0:-1024},${clamp?255:1023})`;
}

// Emits straight-line GLSL ES 3, one original TEV program per shader. Callers
// supply sampled RGBA8 texture/raster values per stage, BEFORE swap selection.
// Texture addressing, texgen, lighting, fog and pixel-engine state are separate.
export function generateTevFunction(input,{swaps=defaultTevSwaps}={}) {
  const stages=explicitTevStages(input);
  if(swaps.length!==4||swaps.some(s=>typeof s!=='string'||!(/^[rgba]{4}$/).test(s)))throw Error('Native TEV swap table');
  const lines=['uniform ivec4 tevRegisters[4];','uniform ivec4 tevKonst[4];',
    `ivec4 nativeTev(ivec4 texels[${stages.length}],ivec4 raster[${stages.length}]) {`,
    'ivec4 r[4]; for(int i=0;i<4;i++)r[i]=tevRegisters[i];'];
  stages.forEach((s,i)=>{
    lines.push('{',`ivec4 t=texels[${i}].${swaps[s[23]]};`,`ivec4 v=raster[${i}].${swaps[s[22]]};`,
      `ivec4 k=ivec4(${constant(s[24],false)},${constant(s[25],true)});`);
    for(let j=0;j<4;j++)lines.push(`ivec4 ${'abcd'[j]}=ivec4(${colorInputs[s[9+j]]},${alphaInputs[s[18+j]]})${j<3?'&ivec4(255)':''};`);
    // Both color and alpha read the old register state, even if their output
    // registers alias. The four input vectors above snapshot them together.
    lines.push(`r[${s[8]}].rgb=${combine(s,false)};`,`r[${s[17]}].a=${combine(s,true)};`,'}');
  });
  const last=stages.at(-1);
  lines.push(`return ivec4(r[${last[8]}].rgb,r[${last[17]}].a);`,'}');
  return lines.join('\n');
}
