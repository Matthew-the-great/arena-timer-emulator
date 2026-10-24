import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';import {Engine} from './engine.mjs';
import {handleQemu} from './qemu/manager.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),port=Number(process.env.PORT||8757),file=process.env.SIM_STATE_FILE||path.join(root,'state.json');
let saved={preferences:{},bindings:{},timerName:'',wifiSSID:'',syncTargetIP:'',loraRadioPresent:true};try{saved={...saved,...JSON.parse(fs.readFileSync(file,'utf8'))};}catch(e){if(e.code!=='ENOENT')throw e;}
let engine=null,state=null,powered=false,bootAt=0,busy=false,pairUntil=0,radio='ESP-NOW',lastRemote=0,network=true,bootloader=false;
const viewers=new Set(),sockets=new Set(),logs=[];let nvsJSON=JSON.stringify(saved.preferences);
function persist(){fs.writeFileSync(file+'.tmp',JSON.stringify(saved,null,2));fs.renameSync(file+'.tmp',file);}
function log(message){logs.push({at:new Date().toLocaleTimeString('en-US',{timeZone:'America/New_York'}),message});if(logs.length>60)logs.shift();}
function status(){const s=state||{};const b=role=>saved.bindings[role]||{};return {...s,currentTime:`${String(Math.floor((s.seconds||0)/60)).padStart(2,'0')}:${String((s.seconds||0)%60).padStart(2,'0')}`,pairing:Date.now()<pairUntil,pairingSecondsLeft:Math.max(0,Math.ceil((pairUntil-Date.now())/1000)),myIP:'127.0.0.1:'+port,timerName:saved.timerName,wifiSSID:saved.wifiSSID,syncTargetIP:saved.syncTargetIP,loraRadioPresent:saved.loraRadioPresent,...Object.fromEntries(['red','blue','judge'].flatMap(r=>[[r,!!(b(r).lora||b(r).esp)],[r+'Lora',!!b(r).lora],[r+'EspNow',!!b(r).esp]])),...Object.fromEntries(['readyRequired','redReady','blueReady','tapoutBlue','tapoutEnabled','audioEnabled','remoteAudioEnabled','displayInverted'].map(k=>[k,!!s[k]]))};}
function snapshot(){return {device:status(),powered,bootloader,network,radio,logs};}
function sendWS(socket,text){const b=Buffer.from(text);let h;if(b.length<126)h=Buffer.from([0x81,b.length]);else{h=Buffer.alloc(4);h[0]=0x81;h[1]=126;h.writeUInt16BE(b.length,2);}if(!socket.destroyed)socket.write(Buffer.concat([h,b]));}
let lastTime='';function broadcast(){const text=`data: ${JSON.stringify(snapshot())}\n\n`;for(const v of viewers){if(v.writableLength>1000000)v.destroy();else v.write(text);}const time=status().currentTime;if(time!==lastTime&&powered&&network&&!bootloader){lastTime=time;for(const s of sockets)sendWS(s,time);}}
async function boot(){if(engine){engine.stop();engine=null;}powered=true;bootloader=false;busy=false;pairUntil=0;lastRemote=0;const e=new Engine();engine=e;e.on('log',log);e.on('state',s=>{if(engine!==e)return;state=s;const prefs=JSON.stringify(s.preferences);if(prefs!==nvsJSON){saved.preferences=s.preferences;nvsJSON=prefs;persist();}});e.on('stopped',m=>{if(engine===e){powered=false;log(m);broadcast();}});await e.boot(saved.preferences);bootAt=performance.now();log('ESP32 boot · native timer/display firmware · simulated '+(saved.wifiSSID?'Wi-Fi station':'TimerSetup access point'));broadcast();}
async function command(line){if(!powered||bootloader||!engine)throw Error('ESP32 is powered off or in download mode');await engine.send(line);broadcast();}
async function remote(role,cmd){const now=Date.now();if(!powered||bootloader)throw Error('ESP32 is off');if(radio==='LoRa'&&!saved.loraRadioPresent){log('LoRa packet ignored: module not installed');return;}if(cmd!=='horn'&&now-lastRemote<300)return;lastRemote=now;const backend=radio==='LoRa'?'lora':'esp';if(now<pairUntil){saved.bindings[role]={...saved.bindings[role],[backend]:true};pairUntil=0;persist();log(`Paired ${role} via ${radio}`);return;}if(!saved.bindings[role]?.[backend]){log(`Rejected unpaired ${role} ${radio} remote. Use Pair Remote in the device page.`);return;}log(`${radio} ${role} → ${cmd}`);if(role==='judge')await command(cmd==='horn'?'horn':'cmd '+cmd);else await command('cmd '+(state.state==='RUNNING'?'tapout':'ready')+(role==='red'?'Red':'Blue'));}
const ok=(res,text='OK',code=200,type='text/plain')=>{res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store'});res.end(text);};
const number=(p,k,def=0)=>Number.isFinite(Number(p.get(k)))?Number(p.get(k)||def):def;
const bool=(p,k,def)=>p.has(k)?p.get(k)==='true':def;
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost'),p=u.searchParams,route=u.pathname;
 if(await handleQemu(req,res,u))return;
 if(route==='/setwifi'&&req.method==='POST'){let body='';for await(const chunk of req){body+=chunk;if(body.length>4000)throw Error('Form too large');}for(const [k,v] of new URLSearchParams(body))p.set(k,v);}
 if(route==='/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});viewers.add(res);res.write(`data: ${JSON.stringify(snapshot())}\n\n`);req.on('close',()=>viewers.delete(res));return;}
 if(route==='/sim/state')return ok(res,JSON.stringify(snapshot()),200,'application/json');
 if(route==='/sim/action'){
  if(req.method!=='POST')return ok(res,'Use POST',405);const origin=req.headers.origin;if(origin&&origin!==`http://${req.headers.host}`)return ok(res,'Use the simulator page on this server',403);
  let body='';for await(const chunk of req){body+=chunk;if(body.length>4000)throw Error('Request too large');}const a=JSON.parse(body);
  if(a.action==='power'){if(powered){const old=engine;engine=null;old?.stop();powered=false;log('Power disconnected');}else await boot();}
  else if(a.action==='reboot')await boot();
  else if(a.action==='bootloader'){const old=engine;engine=null;old?.stop();powered=true;bootloader=true;log('BOOT held during EN reset: ROM download mode (simulated). Press EN to boot firmware.');}
  else if(a.action==='network'){network=!network;log(network?'Virtual Wi-Fi link restored':'Virtual Wi-Fi link lost; timer continues locally');if(!network)for(const s of sockets)s.destroy();}
  else if(a.action==='radio'){if(!['ESP-NOW','LoRa'].includes(a.value))throw Error('Unknown radio');radio=a.value;}
  else if(a.action==='lora'){saved.loraRadioPresent=!saved.loraRadioPresent;persist();}
  else if(a.action==='remote'){if(!['red','blue','judge'].includes(a.role)||!['ready','start','pause','reset','switch','horn'].includes(a.command))throw Error('Invalid remote');await remote(a.role,a.command);}
  else if(a.action==='local'){if(!['start','pause','reset','switch','readyRed','readyBlue','horn'].includes(a.command))throw Error('Invalid button');log('Bench input → '+a.command);if(a.command==='readyRed'||a.command==='readyBlue'){const team=a.command.slice(5);if(state?.state==='RUNNING')await command('cmd tapout'+team);else if(state?.readyRequired)await command('cmd ready'+team);}else await command(a.command==='horn'?'horn':'cmd '+a.command);}
  else throw Error('Unknown simulator action');broadcast();return ok(res,'OK');
 }
 const assets={'/':'index.html','/sim.js':'sim.js','/sim.css':'sim.css'};
 if(assets[route])return ok(res,fs.readFileSync(path.join(root,'public',assets[route])),200,route.endsWith('.js')?'text/javascript':route.endsWith('.css')?'text/css':'text/html');
 if(!powered||bootloader||!network)return ok(res,'Virtual ESP32 unavailable: restore power/network or press EN in the simulator.',503);
 if(route==='/device')return ok(res,fs.readFileSync(path.join(root,'build/device.html')),200,'text/html');
 if(route==='/status')return ok(res,JSON.stringify(status()),200,'application/json');
 const active=['RUNNING','PAUSED','PRE_COUNTDOWN_LOOP','PRE_COUNTDOWN_INIT'].includes(state?.state);
 if(['/setcolor','/setbrightness','/setaudio'].includes(route)&&active)return ok(res,'Locked during match',403);
 if(['/settime','/setmatchtime'].includes(route)&&['RUNNING','PRE_COUNTDOWN_LOOP','PRE_COUNTDOWN_INIT'].includes(state?.state))return ok(res,'Cannot set time while match is active!',403);
 if(route==='/control'||route==='/synccmd'){const cmd=p.get('cmd');if(cmd==='readytoggle')await command('ready '+(p.get('state')==='on'?1:0));else if(cmd==='tapouttoggle')await command('tapout '+(p.get('state')==='on'?1:0));else if(['start','pause','reset','switch','clockOff','readyRed','readyBlue','tapoutRed','tapoutBlue'].includes(cmd))await command('cmd '+cmd);else return ok(res,'Unknown command',400);}
 else if(route==='/settime'||route==='/setmatchtime')await command(`${route==='/settime'?'time':'match'} ${Math.trunc(number(p,'m'))} ${Math.trunc(number(p,'s'))}`);
 else if(route==='/setcolor'){let hex=p.get('hex');if(!/^[a-f0-9]{6}$/i.test(hex))return ok(res,'Invalid color',400);if([0,2,4].every(i=>parseInt(hex.slice(i,i+2),16)>180))hex='323232';await command('color '+hex);}
 else if(route==='/setbrightness')await command('brightness '+Math.trunc(number(p,'val')));
 else if(route==='/flip')await command('flip '+(state.displayInverted?0:1));
 else if(route==='/setaudio')await command(`audio ${+bool(p,'enabled',state.audioEnabled)} ${+bool(p,'remoteEnabled',state.remoteAudioEnabled)} ${number(p,'output')===1?1:0}`);
 else if(route==='/synctime'){if(!['IDLE','CLOCK_MODE'].includes(state.state))return ok(res,'Timer is active!',403);await command(`clock ${Math.max(0,Math.min(23,number(p,'h')))} ${Math.max(0,Math.min(59,number(p,'m')))} ${Math.max(0,Math.min(59,number(p,'s')))}`);}
 else if(route==='/pair'){pairUntil=Date.now()+15000;log('Pairing open for 15 seconds: press a virtual remote button');}
 else if(route==='/clear_remotes'){saved.bindings={};pairUntil=0;persist();log('All remote bindings cleared');}
 else if(route==='/setname'){saved.timerName=(p.get('name')||'').slice(0,32);persist();}
 else if(route==='/setsyncip'){saved.syncTargetIP=(p.get('ip')||'').slice(0,80);persist();log('Sync target saved for inspection; outbound hardware sync is not enabled in this simulator');}
 else if(route==='/setwifi'){if(!p.get('ssid')||!p.get('pass'))return ok(res,'Both SSID and password are required',400);saved.wifiSSID=p.get('ssid').slice(0,64);persist();await boot();log('Wi-Fi credentials simulated; PC network unchanged');return ok(res,'<!doctype html><meta http-equiv="refresh" content="2;url=/device"><body style="background:black;color:white;font-family:Arial;text-align:center"><h2>Virtual Wi-Fi saved. Rebooting…</h2><p>The PC network was not changed.</p>',200,'text/html');}
 else if(route==='/clearwifi'){saved.wifiSSID='';persist();await boot();}
 else if(route==='/factoryreset'){saved={preferences:{},bindings:{},timerName:'',wifiSSID:'',syncTargetIP:'',loraRadioPresent:true};nvsJSON='{}';persist();await boot();}
 else if(route==='/update')return ok(res,'OTA flashing requires a real ESP32. This simulator runs native C++ built from the source. Run npm run build and restart to load firmware source changes.',501);
 else if(route==='/syncsetting')return ok(res,'Peer synchronization is not implemented in this single-device simulator.',501);
 else return ok(res,'Not found',404);
 log('HTTP '+route);broadcast();return ok(res);
 }catch(e){log('Error: '+e.message);ok(res,e.message,400);}});
server.on('upgrade',(req,socket)=>{if(req.url!=='/ws'||!powered||!network){socket.destroy();return;}const key=req.headers['sec-websocket-key'];if(!key){socket.destroy();return;}const accept=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');sockets.add(socket);sendWS(socket,status().currentTime);socket.on('data',b=>{if((b[0]&15)===8)socket.end(Buffer.from([0x88,0]));});socket.on('error',()=>sockets.delete(socket));socket.on('close',()=>sockets.delete(socket));});
if(fs.existsSync(path.join(root,'build/firmware.exe')))await boot();server.listen(port,'0.0.0.0',()=>console.log(`ArenaTimer Simulator: http://localhost:${port}`));
setInterval(async()=>{if(engine&&powered&&!bootloader&&!busy){busy=true;const e=engine;try{await e.send('step '+Math.floor(performance.now()-bootAt));}catch(e){log(e.message);}finally{busy=false;}}broadcast();},50);
process.on('SIGINT',()=>{engine?.stop();server.close();process.exit();});process.on('exit',()=>engine?.stop());
