import {test} from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {once} from 'node:events';
test('original UI routes, WebSocket, remote pairing and network isolation',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'arena-simulator-test-'));const port=18757,base=`http://localhost:${port}`;
 const child=spawn(process.execPath,['server.mjs'],{cwd:import.meta.dirname,env:{...process.env,PORT:String(port),GUEST_PORT:'0',SIM_STATE_FILE:path.join(dir,'state.json')},windowsHide:true});let ws;
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server start timeout')),8000);child.stdout.on('data',chunk=>{if(String(chunk).includes('ArenaTimer Simulator:')){clearTimeout(timer);resolve();}});child.on('error',reject);});
  await new Promise(r=>setTimeout(r,1100));
  const act=async data=>{const r=await fetch(base+'/sim/action',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(data)});assert.equal(r.status,200,await r.text());};
  const status=async()=>await(await fetch(base+'/status')).json();
  assert.match(await(await fetch(base+'/device')).text(),/window.location.host\}\/ws/);
  ws=new WebSocket(`ws://localhost:${port}/ws`);const message=await new Promise((resolve,reject)=>{ws.onmessage=e=>resolve(e.data);ws.onerror=reject;});assert.equal(message,'02:00');
  await act({action:'remote',role:'red',command:'ready'});assert.equal((await status()).redReady,false);
  await fetch(base+'/pair');await new Promise(r=>setTimeout(r,310));await act({action:'remote',role:'red',command:'ready'});assert.equal((await status()).redEspNow,true);assert.equal((await status()).redReady,false);
  await new Promise(r=>setTimeout(r,310));await act({action:'remote',role:'red',command:'ready'});assert.equal((await status()).redReady,true);
  await fetch(base+'/control?cmd=start');await new Promise(r=>setTimeout(r,3500));assert.equal((await status()).state,'RUNNING');
  assert.equal((await fetch(base+'/settime?m=0&s=2')).status,403);
  await act({action:'network'});assert.equal((await fetch(base+'/status')).status,503);const s=await(await fetch(base+'/sim/state')).json();assert.equal(s.device.state,'RUNNING');
  await act({action:'network'});await fetch(base+'/control?cmd=pause');assert.equal((await status()).state,'PAUSED');await fetch(base+'/control?cmd=reset');assert.equal((await status()).currentTime,'02:00');
  await act({action:'reboot'});await new Promise(r=>setTimeout(r,1100));assert.equal((await status()).redEspNow,true);
  const wifi=await fetch(base+'/setwifi',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'ssid=VirtualVenue&pass=simulation-only'});assert.equal(wifi.status,200);assert.equal((await status()).wifiSSID,'VirtualVenue');assert.ok(!fs.readFileSync(path.join(dir,'state.json'),'utf8').includes('simulation-only'));
 }finally{ws?.close();child.kill();await once(child,'exit');fs.rmSync(dir,{recursive:true});}
});
