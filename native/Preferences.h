#pragma once
#include <map>
#include <string>
inline std::map<std::string,unsigned long> nvs;
class Preferences{
 public:void begin(const char*,bool){}void end(){}
 void putBool(const char* k,bool v){nvs[k]=v;}void putUInt(const char* k,unsigned long v){nvs[k]=v;}void putUChar(const char* k,unsigned char v){nvs[k]=v;}
 bool getBool(const char* k,bool v){return nvs.count(k)?nvs[k]:v;}
 unsigned int getUInt(const char* k,unsigned int v){return nvs.count(k)?nvs[k]:v;}
 unsigned char getUChar(const char* k,unsigned char v){return nvs.count(k)?nvs[k]:v;}
};
