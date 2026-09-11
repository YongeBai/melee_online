// Only publish the customized CSS. This is checked at native capture time,
// before readback and encoding, rather than hiding already-delivered frames.
#pragma once
#include <cstdint>
namespace MeleeBridge {
inline bool MenuFrameReady(const unsigned char* ram) {
  if (!ram || ram[0x479d30] != 2 || ram[0x479d33] != 0) return true;
  const auto valid=[](std::uint32_t p){return p>=0x80003100 && p<0x817fffc0;};
  const auto word=[ram](std::uint32_t p){const auto* b=ram+(p-0x80000000);return
    (std::uint32_t(b[0])<<24)|(std::uint32_t(b[1])<<16)|(std::uint32_t(b[2])<<8)|b[3];};
  const auto scene=word(0x804d6720), root=word(0x804d6cbc), cursor=word(0x804a0bc0);
  if (!valid(scene) || ram[scene-0x80000000]!=8 || !valid(root) || !valid(cursor)) return false;
  const auto hand=word(cursor);
  return word(0x80001b40)==1 && valid(hand) && word(root+28)==0x80001c00 && word(hand+28)==0x80001840;
}
}
