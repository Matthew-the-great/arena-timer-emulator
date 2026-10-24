#include "config.h"
#include "timerLogic.h"
#include "display.h"
#include <iostream>
#include <sstream>
#include <iomanip>
unsigned long simMillis=0;
bool simTone=false,simRelay=false;
time_t clockBase=time(nullptr);
Preferences preferences;
int current_time=120,countdown_time=120,currentState=IDLE,countdown=3,scrollIndex=0;
unsigned long lastScrollTime=0;
bool readyRequired=false,blueReady=false,redReady=false,tapoutInitiatorIsBlue=true;
volatile bool needsLEDUpdate=false;
bool audioEnabled=true,remoteAudioEnabled=true,displayInverted=false,tapoutEnabled=true,isDoubleSided=true;
uint8_t audioOutputSelect=0,systemBrightness=127;
uint32_t beepEndTime=0;bool beepActive=false;
CRGB digitColor=CRGB::Red;
void updateClient(){}
void pushSyncSetting(const char*,const String&){}
void queueCommand(const char* cmd){processCommand(cmd);}
extern CRGB digit_physical[],border_physical[];
#include "settings.inc"
void boot(){
 readyRequired=preferences.getBool("readyRequired",false);displayInverted=preferences.getBool("dispInv",false);tapoutEnabled=preferences.getBool("tapoutEnabled",true);
 audioEnabled=preferences.getBool("audioEnabled",true);remoteAudioEnabled=preferences.getBool("remoteAudio",true);audioOutputSelect=preferences.getUChar("audioOutput",0);
 systemBrightness=preferences.getUChar("brightness",127);digitColor=CRGB(preferences.getUInt("digitColor",0xFF0000));
 countdown_time=preferences.getBool("timeSelState",false)?180:120;current_time=countdown_time;currentState=CONNECTING;
}
void step(unsigned long target){
 while(simMillis+20<=target){simMillis+=20;checkAudioTimeout();
  switch(currentState){case CONNECTING:handleConnectingAnimation();if(simMillis>=1000){currentState=preferences.getBool("clockActive",false)?CLOCK_MODE:IDLE;updateLEDs();setBorder();}break;
   case PRE_COUNTDOWN_INIT:startPreCountdown();break;case PRE_COUNTDOWN_LOOP:handlePreCountdownAnimation();break;case RUNNING:updateTimer();break;case PAUSED:handlePausedBlink();break;case CLOCK_MODE:handleClockMode();break;case TAPOUT:handleTapoutAnimation();break;}
  if(needsLEDUpdate){applyDoubleSidedMirror();showLeds();needsLEDUpdate=false;}
 }
}
void colors(CRGB* a){std::cout<<'"';for(int i=0;i<DOUBLE_STRIP_LEN;i++)std::cout<<std::hex<<std::setfill('0')<<std::setw(2)<<(int)a[i].r<<std::setw(2)<<(int)a[i].g<<std::setw(2)<<(int)a[i].b;std::cout<<std::dec<<'"';}
void snapshot(){
 const char* states[]={"CONNECTING","IDLE","PRE_COUNTDOWN_INIT","PRE_COUNTDOWN_LOOP","RUNNING","PAUSED","FINISHED","CLOCK_MODE","TAPOUT"};
 std::cout<<"{\"state\":\""<<states[currentState]<<"\",\"seconds\":"<<current_time<<",\"duration\":"<<countdown_time<<",\"preCountdown\":"<<countdown<<",\"millis\":"<<simMillis;
 std::cout<<",\"redReady\":"<<redReady<<",\"blueReady\":"<<blueReady<<",\"readyRequired\":"<<readyRequired<<",\"tapoutBlue\":"<<tapoutInitiatorIsBlue<<",\"tapoutEnabled\":"<<tapoutEnabled<<",\"displayInverted\":"<<displayInverted;
 std::cout<<",\"audioEnabled\":"<<audioEnabled<<",\"remoteAudioEnabled\":"<<remoteAudioEnabled<<",\"audioOutput\":"<<(int)audioOutputSelect<<",\"brightness\":"<<(int)systemBrightness<<",\"tone\":"<<simTone<<",\"relay\":"<<simRelay;
 std::cout<<",\"digitColor\":\""<<std::hex<<std::setfill('0')<<std::setw(2)<<(int)digitColor.r<<std::setw(2)<<(int)digitColor.g<<std::setw(2)<<(int)digitColor.b<<std::dec<<"\",\"digits\":";colors(digit_physical);std::cout<<",\"border\":";colors(border_physical);
 std::cout<<",\"preferences\":{";bool first=true;for(auto& [k,v]:nvs){if(!first)std::cout<<',';first=false;std::cout<<'"'<<k<<"\":"<<v;}std::cout<<"}}"<<std::endl;
}
int main(){
 std::string line;
 while(std::getline(std::cin,line)){std::istringstream in(line);std::string cmd;in>>cmd;
  if(cmd=="step"){unsigned long ms;in>>ms;step(ms);}else if(cmd=="cmd"){std::string v;in>>v;processCommand(v);}
  else if(cmd=="pref"){std::string k;unsigned long v;in>>k>>v;nvs[k]=v;}
  else if(cmd=="boot")boot();
  else if(cmd=="time"||cmd=="match"){int m,s;in>>m>>s;if(cmd=="time")applyOneOffTime(m,s);else applyMatchTime(m,s);}
  else if(cmd=="color"){uint32_t n;in>>std::hex>>n;applyDigitColor(n);}
  else if(cmd=="brightness"){int v;in>>v;applyBrightnessSetting(v);}
  else if(cmd=="flip"){int v;in>>v;applyDisplayInverted(v);}
  else if(cmd=="audio"){int a,b,c;in>>a>>b>>c;applySettingsAudio(a,b,c);}
  else if(cmd=="ready"){int v;in>>v;applyReadyRequired(v);}
  else if(cmd=="tapout"){int v;in>>v;applyTapoutEnabled(v);}
  else if(cmd=="clock"){int h,m,s;in>>h>>m>>s;applyClockMode(h,m,s);}
  else if(cmd=="horn"){if(audioEnabled&&remoteAudioEnabled)triggerBeep(250);}
  if(needsLEDUpdate){applyDoubleSidedMirror();showLeds();needsLEDUpdate=false;}snapshot();
 }
}
