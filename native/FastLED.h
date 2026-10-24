#pragma once
#include <cstdint>
struct CRGB{
 uint8_t r=0,g=0,b=0;
 CRGB()=default;CRGB(uint32_t n):r(n>>16),g(n>>8),b(n){}CRGB(int r,int g,int b):r(r),g(g),b(b){}
 static const CRGB Red,Blue,Green,Black;
};
inline const CRGB CRGB::Red{255,0,0},CRGB::Blue{0,0,255},CRGB::Green{0,128,0},CRGB::Black{0,0,0};
constexpr int NEOPIXEL=0;
struct FastLEDMock{template<int A,int B>void addLeds(CRGB*,int){}void setBrightness(int){}void show(){}};
inline FastLEDMock FastLED;
