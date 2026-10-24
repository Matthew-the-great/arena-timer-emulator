import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';import crypto from 'node:crypto';
const root=path.dirname(fileURLToPath(import.meta.url)),source=path.resolve(root,'../ArenaTimer/Software/main'),out=path.join(root,'build');fs.mkdirSync(out,{recursive:true});
const main=fs.readFileSync(path.join(source,'src/main.cpp'),'utf8');
const settings=main.slice(main.indexOf('void applyDigitColor(uint32_t hex) {'),main.indexOf('void handleSetTime() {'));
if(!settings.includes('void applyMatchTime'))throw Error('Firmware settings extraction failed');
fs.writeFileSync(path.join(out,'settings.inc'),settings);
const browser=fs.readFileSync(path.join(source,'include/browser.h'),'utf8').match(/R"rawliteral\(([\s\S]*?)\)rawliteral"/)[1];
fs.writeFileSync(path.join(out,'device.html'),browser.replace('ws://${window.location.hostname}:81/','ws://${window.location.host}/ws'));
const compiler=process.env.CXX||'C:/msys64/ucrt64/bin/g++.exe';
const args=['-std=c++17','-O2','-static','-DENABLE_DEBUG_LOG','-I'+path.join(root,'native'),'-I'+out,'-I'+path.join(source,'include'),path.join(root,'native/host.cpp'),path.join(source,'src/timerLogic.cpp'),path.join(source,'src/display.cpp'),'-o',path.join(out,'firmware.exe')];
const r=spawnSync(compiler,args,{stdio:'inherit',env:{...process.env,PATH:path.dirname(compiler)+';'+process.env.PATH}});if(r.status!==0){console.error(r.error||'Compiler failed');process.exit(r.status||1);}
const files=['src/timerLogic.cpp','src/display.cpp','src/main.cpp','include/browser.h'];fs.writeFileSync(path.join(out,'source-manifest.json'),JSON.stringify(Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(source,f))).digest('hex')])),null,2));
console.log('Built native timer/display firmware and extracted original web UI.');
