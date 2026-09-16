// Copyright 2016 Dolphin Emulator Project
// SPDX-License-Identifier: GPL-2.0-or-later
// Lighting/texgen arithmetic adapted from LightingShaderGen.cpp and
// VertexShaderGen.cpp at Dolphin a2efdf1197be8132674b90fe9cf4761df39752ed.
// This emits shaders for native HSD state; no emulator or command FIFO is used.
import {generateTevFunction} from './tev-shader.mjs';

function lighting(pixel) {
  const result=[`uniform ivec4 lightColor[8];
uniform vec3 lightPosition[8],lightDirection[8],lightAngular[8],lightDistance[8];
uniform ivec4 ambientColor[2],materialColor[2];
vec3 safeNormal(vec3 v){float d=dot(v,v);return d>0.0?v*inversesqrt(d):vec3(0);}`];
  for(let channel=0;channel<2;channel++) {
    result.push(`vec4 nativeLighting${channel}(vec4 vertexColor,vec3 pos,vec3 normal){ivec4 v=ivec4(round(vertexColor*255.0));ivec4 material=ivec4(0),acc=ivec4(255);`);
    for(const [offset,swizzle,type] of [[0,'rgb','ivec3'],[2,'a','int']]) {
      const c=pixel.channels[channel+offset];if(!c)continue;
      // GXSetChanCtrl forces diffuse NONE when attenuation is SPEC.
      const diffuseFn=c.attenuation===0?0:c.diffuse;
      result.push(`material.${swizzle}=${c.materialSource?'v':`materialColor[${channel}]`}.${swizzle};`);
      if(!c.enabled)continue;
      result.push(`acc.${swizzle}=${c.ambientSource?'v':`ambientColor[${channel}]`}.${swizzle};`);
      for(let i=0;i<8;i++)if(c.lights&(1<<i)) {
        result.push(`{vec3 delta=lightPosition[${i}]-pos;vec3 direction=safeNormal(delta);float attenuation=1.0;`);
        if(c.attenuation===2)result.push('if(dot(direction,direction)==0.0)direction=normal;');
        else if(c.attenuation===0)result.push(`float a=dot(normal,direction)>=0.0?max(0.0,dot(normal,lightDirection[${i}])):0.0;
vec3 terms=vec3(1.0,a,a*a);attenuation=max(0.0,dot(lightAngular[${i}],terms))/dot(${diffuseFn===0?`lightDistance[${i}]`:`safeNormal(lightDistance[${i}])`},terms);`);
        else if(c.attenuation===1)result.push(`float distance2=dot(delta,delta),distance=sqrt(distance2);float a=max(0.0,dot(direction,lightDirection[${i}]));
attenuation=max(0.0,lightAngular[${i}].x+lightAngular[${i}].y*a+lightAngular[${i}].z*a*a)/dot(lightDistance[${i}],vec3(1.0,distance,distance2));`);
        else throw Error('Native shader attenuation');
        const diffuse=diffuseFn===0?'1.0':diffuseFn===1?'dot(direction,normal)':'max(0.0,dot(direction,normal))';
        result.push(`acc.${swizzle}+=${type}(round(attenuation*${diffuse}*${offset?'float':'vec3'}(lightColor[${i}].${swizzle})));}`);
      }
    }
    result.push('acc=clamp(acc,0,255);return vec4((material*(acc+(acc>>7)))>>8)/255.0;}');
  }
  return result.join('\n');
}
function alphaTest(a) {
  const compare=(op,ref)=>['false',`color.a<${ref}`,`color.a==${ref}`,`color.a<=${ref}`,`color.a>${ref}`,`color.a!=${ref}`,`color.a>=${ref}`,'true'][op];
  const left=compare(a.compare0,'alphaReference.x'),right=compare(a.compare1,'alphaReference.y'),op=['&&','||','!=','=='][a.operation];
  if(!left||!right||!op)throw Error('Native shader alpha comparison');return `((${left})${op}(${right}))`;
}
// Only shader-generating state belongs in this key. Matrices, light values,
// colors, alpha references and texture resources are uploaded as uniforms.
export function materialShaderKey({tev,textures,pixel},attributes,{immediateRegisters=false}={}) {
  const a=pixel.alphaTest;
  return JSON.stringify([tev.stages,textures.generators,textures.textures.map(t=>t.id),pixel.channelCount,pixel.channels,[a.compare0,a.operation,a.compare1],attributes.map(a=>a.attr).sort((a,b)=>a-b),immediateRegisters]);
}
export function generateMaterialShaders({tev,textures,pixel},attributes,{immediateRegisters=false}={}) {
  const has=id=>attributes.some(a=>a.attr===id),gens=textures.generators;
  // Immediate geometry supplies only UV0. Keep other layouts on the ordinary
  // uniform path instead of stealing an attribute location they might use.
  if(immediateRegisters&&(attributes.some(a=>![9,11,13].includes(a.attr))||gens.some(g=>g.source>=5&&g.source<=11)))throw Error('Native immediate register layout');
  const outputs=['out vec4 raster0,raster1;','out vec3 transformedPosition,transformedNormal,verifiedTexcoord;',...gens.map(g=>`out vec3 texcoord${g.id};`)];
  if(immediateRegisters)outputs.push('flat out highp ivec4 tevRegisters[4];');
  const declarations=`layout(location=0) in vec3 rawPosition;
layout(location=1) in float positionIndex;
layout(location=2) in vec3 rawNormal;
layout(location=3) in vec3 rawBinormal;
layout(location=4) in vec3 rawTangent;
layout(location=5) in vec4 rawColor0;
layout(location=6) in vec4 rawColor1;
${Array.from({length:immediateRegisters?1:8},(_,i)=>`layout(location=${i+7}) in vec3 rawUV${i};`).join('\n')}
${immediateRegisters?Array.from({length:4},(_,i)=>`layout(location=${i+8}) in ivec4 rawTev${i};`).join('\n'):''}
uniform vec4 positionRows[30],normalRows[30],textureRows[30],postRows[60];
uniform mat4 projection;
uniform int currentMatrix;
vec3 rowTransform(vec4 p,int first,int kind){
if(kind==0)return vec3(dot(p,positionRows[first]),dot(p,positionRows[first+1]),dot(p,positionRows[first+2]));
if(kind==1)return vec3(dot(p,normalRows[first]),dot(p,normalRows[first+1]),dot(p,normalRows[first+2]));
if(kind==2)return vec3(dot(p,textureRows[first]),dot(p,textureRows[first+1]),dot(p,textureRows[first+2]));
return vec3(dot(p,postRows[first]),dot(p,postRows[first+1]),dot(p,postRows[first+2]));}
vec3 textureTransform(vec4 v,int id){if(id==60)return v.xyz;if(id<30)return rowTransform(v,id,0);return rowTransform(v,id-30,2);}`;
  const body=[`int slot=${has(0)?'int(positionIndex)':'currentMatrix*3'};vec4 position=vec4(rawPosition,1.0);
transformedPosition=rowTransform(position,slot,0);
transformedNormal=safeNormal(rowTransform(vec4(rawNormal,0.0),slot,1));
vec4 lit0=nativeLighting0(${has(11)?'rawColor0':has(12)?'rawColor1':'vec4(1)'},transformedPosition,transformedNormal);
vec4 lit1=nativeLighting1(${has(11)&&has(12)?'rawColor1':'vec4(1)'},transformedPosition,transformedNormal);
raster0=${pixel.channelCount>0?'lit0':'vec4(0)'};raster1=${pixel.channelCount>1?'lit1':'vec4(0)'};
gl_Position=projection*vec4(transformedPosition,1.0);gl_Position.z=2.0*gl_Position.z+gl_Position.w;`];
  if(immediateRegisters)for(let i=0;i<4;i++)body.push(`tevRegisters[${i}]=rawTev${i};`);
  for(const g of gens) {
    if(g.type===10) {
      if(![19,20].includes(g.source))throw Error('Native SRTG source');
      body.push(`texcoord${g.id}=vec3(lit${g.source-19}.xy,1.0);`);continue;
    }
    if(g.type>=2&&g.type<=9) {
      const source=g.source-12;if(source<0||source>=g.id||!has(25))throw Error('Native bump requires previous texcoord and NBT');
      body.push(`{vec3 direction=safeNormal(lightPosition[${g.type-2}]-transformedPosition);texcoord${g.id}=texcoord${source}+vec3(dot(direction,rowTransform(vec4(rawTangent,0),slot,1)),dot(direction,rowTransform(vec4(rawBinormal,0),slot,1)),0);}`);continue;
    }
    if(g.type>1)throw Error('Native texgen type');
    const source=g.source===0?'vec4(rawPosition,1.0)':g.source===1?'vec4(rawNormal,1.0)':g.source===2?'vec4(rawBinormal,1.0)':g.source===3?'vec4(rawTangent,1.0)':g.source>=4&&g.source<=11?`vec4(rawUV${g.source-4}.xy,1.0,1.0)`:null;
    if(!source)throw Error('Native matrix texgen source');
    const id=has(g.id+1)?`int(rawUV${g.id}.z)`:String(g.matrix);
    body.push(`{vec3 coord=textureTransform(${source},${id});`);
    if(g.type===1)body.push('coord.z=1.0;');
    if(g.normalize)body.push('coord=safeNormal(coord);');
    if(g.postMatrix!==125){if(g.postMatrix<64||g.postMatrix>121)throw Error('Native post matrix');body.push(`coord=rowTransform(vec4(coord,1),${g.postMatrix-64},3);`);}
    body.push(`if(coord.z==0.0)coord.xy=clamp(coord.xy/2.0,vec2(-1),vec2(1));texcoord${g.id}=coord;}`);
  }
  const vertex='#version 300 es\nprecision highp float;precision highp int;\n'+declarations+'\n'+outputs.join('\n')+'\n'+lighting(pixel)+'\nvoid main(){\n'+body.join('\n')+'\nverifiedTexcoord='+ (gens.length?'texcoord0':'vec3(0)') +';\n}';
  const n=tev.stages.length,samplers=[...new Set(tev.stages.filter(s=>s[1]!==255).map(s=>s[1]))];
  const samples=tev.stages.map((s,i)=>{
    let texture='ivec4(255)';
    if(s[1]!==255){
      const coord=s[0]===255?0:s[0];if(!gens.some(g=>g.id===coord)||!textures.textures.some(t=>t.id===s[1]))throw Error('Native TEV missing texture/coord');
      texture=`ivec4(round(texture(image${s[1]},texcoord${coord}.xy/(texcoord${coord}.z==0.0?1.0:texcoord${coord}.z),lodBias[${s[1]}])*255.0))`;
    }
    const channel=s[2];if(channel===7||channel===8)throw Error('Indirect bump alpha is not integrated');
    const raster=channel<=5?`ivec4(round(raster${channel%2}*255.0))`:'ivec4(0)';
    return `texels[${i}]=${texture};rasters[${i}]=${raster};`;
  });
  const fragment=`#version 300 es
precision highp float;precision highp int;
in vec4 raster0,raster1;
${gens.map(g=>`in vec3 texcoord${g.id};`).join('\n')}
${samplers.map(i=>`uniform sampler2D image${i};`).join('\n')}
uniform float lodBias[8];uniform ivec2 alphaReference;out vec4 fragmentColor;
${generateTevFunction(tev.stages,{registerInput:immediateRegisters?'flat':'uniform'})}
void main(){ivec4 texels[${n}],rasters[${n}];${samples.join('\n')}
ivec4 color=nativeTev(texels,rasters)&ivec4(255);
if(!${alphaTest(pixel.alphaTest)})discard;fragmentColor=vec4(color)/255.0;}`;
  return {vertex,fragment};
}
