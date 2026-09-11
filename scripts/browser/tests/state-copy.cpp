#include <array>
#include <cstdio>
#include <vector>
#include "Common/BrowserCopyBytes.h"
int main() {
  constexpr std::array<std::size_t,18> sizes{0,1,2,15,16,17,31,32,33,63,64,65,127,128,255,4097,65539,1048579};
  for (const auto size : sizes) for (unsigned offset=0;offset<32;++offset) {
    std::vector<unsigned char> source(size+128), destination(size+128,0xa7);
    for(std::size_t i=0;i<source.size();++i) source[i]=static_cast<unsigned char>((i*37u+offset*19u)^(i>>7));
    const auto original=source;
    const auto out_offset=63-offset;
    DolphinWeb::CopySnapshotBytes(destination.data()+out_offset,source.data()+offset,size);
    for(std::size_t i=0;i<destination.size();++i) {
      const auto expected=i>=out_offset && i<out_offset+size ? source[offset+i-out_offset] : 0xa7;
      if(destination[i]!=expected) {std::printf("FAIL size=%zu offset=%u byte=%zu\n",size,offset,i);return 1;}
    }
    if(source!=original) return 2;
  }
  std::puts("PASS: 576 size/alignment cases, boundaries and source preserved");
}
