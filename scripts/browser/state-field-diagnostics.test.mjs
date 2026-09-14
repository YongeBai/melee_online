import test from'node:test';import assert from'node:assert/strict';import{readFileSync,writeFileSync,mkdtempSync,rmSync}from'node:fs';import{execFileSync}from'node:child_process';import{resolve,join}from'node:path';import{tmpdir}from'node:os';
const vendor=resolve('engines/wasm-dolphin/vendor/dolphin/Source/Core');
test('state ranges count every mismatch, bound reports and handle unequal or empty buffers',()=>{
 const dir=mkdtempSync(join(tmpdir(),'melee-state-diff-'));
 try{
 const cpp=join(dir,'test.cpp'),exe=join(dir,'test');
 writeFileSync(cpp,'#include <cassert>\n#include <array>\n#include <random>\n#include "'+vendor+'/Common/BrowserStateDiff.h"\n'+String.raw`
int main(){
 using namespace BrowserStateDiff;
 auto empty=Compare({},{});assert(empty.ranges.empty()&&empty.range_count==0);
 const std::array<uint8_t,4>a{1,2,3,4},b{1,9,3,8};
 auto d=Compare(a,b);assert(d.different_bytes==2&&d.unmatched_bytes==0&&d.range_count==2);
 assert(d.ranges[0].offset==1&&d.ranges[0].length==1&&d.ranges[1].offset==3);
 d=Compare(a,std::span(b).first(2));assert(d.different_bytes==1&&d.unmatched_bytes==2&&d.range_count==1&&d.ranges[0].offset==1&&d.ranges[0].length==3);
 d=Compare({},a);assert(d.different_bytes==0&&d.unmatched_bytes==4&&d.ranges[0].offset==0&&d.ranges[0].length==4);
 d=Compare(a,b,0);assert(d.ranges.empty()&&d.range_count==2&&d.different_bytes==2);
 d=Compare(a,b,1);assert(d.ranges.size()==1&&d.ranges[0].length==1&&d.range_count==2);
 std::mt19937 random(17);
 for(unsigned trial=0;trial<2000;trial++){
  std::vector<uint8_t>x(random()%1025),y(random()%1025);for(auto&v:x)v=random()%4;for(auto&v:y)v=random()%4;
  const auto original_x=x,original_y=y;auto result=Compare(x,y,32);
  size_t unequal=0,range_count=0;bool previous=false;
  for(size_t i=0;i<std::max(x.size(),y.size());i++){
   bool different=i>=x.size()||i>=y.size()||x[i]!=y[i];
   if(i<std::min(x.size(),y.size())&&different)++unequal;
   if(different&&!previous)++range_count;previous=different;
  }
  assert(result.different_bytes==unequal&&result.range_count==range_count&&result.ranges.size()==std::min(size_t(32),range_count));
  for(const auto&r:result.ranges){assert(r.length>0);for(size_t i=r.offset;i<r.offset+r.length;i++)assert(i>=x.size()||i>=y.size()||x[i]!=y[i]);}
  assert(x==original_x&&y==original_y);
 }
}
`);execFileSync('c++',['-std=c++20','-O2',cpp,'-o',exe],{stdio:'pipe'});execFileSync(exe,[],{stdio:'pipe'});
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('field recording is bounded, write-only and does not change serialized bytes or raw equality',()=>{
 const source=readFileSync(vendor+'/Core/State.cpp','utf8');
 const at=source.indexOf('struct BrowserStateField '),end=source.indexOf('\n}',source.indexOf('void BrowserRecordField(',at))+2;
 const implementation=source.slice(at,end),dir=mkdtempSync(join(tmpdir(),'melee-state-fields-'));
 try{
 const cpp=join(dir,'test.cpp'),exe=join(dir,'test');
 writeFileSync(cpp,'#include <string>\n#include <vector>\n#include <cstddef>\n#include <cassert>\nusing u8=unsigned char;\nu8* browser_section_base=nullptr;\nstruct PointerWrap{bool write=true;unsigned offset=12;bool IsWriteMode(){return write;}unsigned GetOffsetFromPreviousPosition(u8*){return offset;}};\n'+implementation+String.raw`
int main(){PointerWrap p;BrowserRecordField(p,"ignored",8);BrowserStateFields fields;browser_fields_recording=&fields;
 p.write=false;BrowserRecordField(p,"ignored",8);assert(fields.fields.empty());
 p.write=true;BrowserRecordField(p,"field",8);assert(fields.fields.size()==1&&fields.fields[0].start==4&&fields.fields[0].end==12&&p.offset==12);
 BrowserRecordField(p,"underflow",13);assert(!fields.complete&&fields.fields.size()==1);
 fields={};for(unsigned i=0;i<32769;i++)BrowserRecordField(p,"field",4);
 assert(!fields.complete&&fields.fields.size()==32768);
}
`);execFileSync('c++',['-std=c++20','-O2',cpp,'-o',exe],{stdio:'pipe'});execFileSync(exe,[],{stdio:'pipe'});
 }finally{rmSync(dir,{recursive:true,force:true});}
 const equality=source.slice(source.indexOf('bool BrowserEqual('),source.indexOf('std::string BrowserCompare('));
 assert.match(equality,/std::memcmp\(browser_states\[a\]\.data\(\), browser_states\[b\]\.data\(\), browser_state_sizes\[a\]\) == 0/);
 assert.doesNotMatch(equality,/BrowserStateDiff|idled|Texture/);
});
