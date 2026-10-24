#pragma once
#include <cstdint>
#include <cstdio>
#include <string>
#include <ctime>
#include <map>
#include <algorithm>
using String=std::string;
extern unsigned long simMillis;
extern bool simTone,simRelay;
extern time_t clockBase;
inline unsigned long millis(){return simMillis;}
inline void tone(int,int){simTone=true;}
inline void noTone(int){simTone=false;}
inline void digitalWrite(int,int v){simRelay=v;}
constexpr int LOW=0,HIGH=1;
template<class T> T constrain(T v,T lo,T hi){return std::clamp(v,lo,hi);}
inline int settimeofday(const timeval* t,void*){clockBase=t->tv_sec-simMillis/1000;return 0;}
inline bool getLocalTime(tm* t){time_t now=clockBase+simMillis/1000;*t=*localtime(&now);return true;}
struct SerialMock{
 int available(){return 0;}char read(){return 0;}
 void println(const char* s){fprintf(stderr,"%s\n",s);}
 template<typename... Args>void printf(const char* fmt,Args... args){fprintf(stderr,fmt,args...);}
};
inline SerialMock Serial;
