import {adaptGuestHtml} from './guest-display.mjs';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';

export const guestHttpPort=18760, guestWsPort=18761, devicePort=Number(process.env.GUEST_PORT||8758);

// A virtual factory identity, persisted separately from application flash.
export function ensureEfuse(file) {
  if(fs.existsSync(file)) return;
  const mac=Buffer.from('020000875700','hex'), data=Buffer.alloc(124);
  let crc=0;
  for(const byte of mac){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0x8c:0);}
  Buffer.from(mac).reverse().copy(data,4);data[10]=crc;
  fs.writeFileSync(file,data,{flag:'wx'});
}

// Relay requests to the actual guest, never to the behavioral simulator.
// Only the browser's hard-coded WebSocket port is adapted for the LAN relay.
export function createGuestRelay(isRunning,stationMode=()=>false) {
  const server=http.createServer((req,res)=>{
    if(!isRunning()){res.writeHead(503);res.end('Virtual ESP32 is powered off.');return;}
    const headers={...req.headers,host:'192.168.4.1','accept-encoding':'identity'};
    const upstream=http.request({host:'127.0.0.1',port:stationMode()?18762:guestHttpPort,path:req.url,method:req.method,headers},reply=>{
      if((reply.headers['content-type']||'').includes('text/html')){
        const chunks=[];let size=0;
        reply.on('data',chunk=>{size+=chunk.length;if(size>2*1024*1024){upstream.destroy(Error('Guest HTML too large'));return;}chunks.push(chunk);});
        reply.on('end',()=>{
          if(res.destroyed)return;
          const body=Buffer.from(adaptGuestHtml(Buffer.concat(chunks).toString()));
          const out={...reply.headers,'content-length':body.length,'cache-control':'no-store'};
          delete out['transfer-encoding'];res.writeHead(reply.statusCode,out);res.end(body);
        });
      }else{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);}
    });
    upstream.setTimeout(15000,()=>upstream.destroy(Error('Guest is not responding yet')));
    upstream.on('error',error=>{if(!res.headersSent){res.writeHead(502,{'Content-Type':'text/plain'});res.end('Virtual ESP32: '+error.message);}else res.destroy();});
    req.on('aborted',()=>upstream.destroy());req.pipe(upstream);
  });
  server.on('upgrade',(req,socket,head)=>{
    if(req.url!=='/ws'||!isRunning()){socket.destroy();return;}
    const upstream=net.connect(stationMode()?18763:guestWsPort,'127.0.0.1',()=>{
      let request='GET / HTTP/1.1\r\n';
      for(const [name,value] of Object.entries(req.headers))request+=`${name}: ${name==='host'?'192.168.4.1:81':value}\r\n`;
      upstream.write(request+'\r\n');if(head.length)upstream.write(head);
      socket.pipe(upstream);upstream.pipe(socket);
    });
    upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());
    socket.on('close',()=>upstream.destroy());upstream.on('close',()=>socket.destroy());
  });
  server.on('error',error=>console.error('Guest relay:',error.message));
  server.listen(devicePort,'0.0.0.0');
  return server;
}
