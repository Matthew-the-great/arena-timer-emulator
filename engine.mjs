import {spawn} from 'node:child_process';import {createInterface} from 'node:readline';import {EventEmitter} from 'node:events';import {fileURLToPath} from 'node:url';
export class Engine extends EventEmitter{
 constructor(){super();this.queue=[];this.child=spawn(fileURLToPath(new URL('./build/firmware.exe',import.meta.url)),[],{windowsHide:true});createInterface({input:this.child.stdout}).on('line',line=>{try{const state=JSON.parse(line);this.state=state;this.queue.shift()?.resolve(state);this.emit('state',state);}catch(e){this.emit('log','Native response error: '+e.message);}});createInterface({input:this.child.stderr}).on('line',line=>this.emit('log',line));this.child.on('error',e=>this.fail(e));this.child.on('exit',()=>this.fail(Error('Firmware process stopped')));}
 fail(e){for(const p of this.queue)p.reject(e);this.queue=[];this.dead=true;this.emit('stopped',e.message);}
 send(line){if(this.dead)return Promise.reject(Error('Firmware is off'));if(/[\r\n]/.test(line))return Promise.reject(Error('Invalid command'));return new Promise((resolve,reject)=>{this.queue.push({resolve,reject});this.child.stdin.write(line+'\n');});}
 async boot(preferences={}){for(const [k,v] of Object.entries(preferences))if(/^[A-Za-z]+$/.test(k)&&Number.isFinite(v))await this.send(`pref ${k} ${v}`);return this.send('boot');}
 stop(){this.child.kill();}
}
