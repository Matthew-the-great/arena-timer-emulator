const $=id=>document.getElementById(id);let serial=null;async function action(a){try{const r=await fetch('/qemu/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(a)});const d=await r.json();if(!r.ok)throw Error(d.error);const label={start:'Start',pause:'Pause',reset:'Reset',switch:'Time Select',blue:'Blue driver',red:'Red driver'}[a.command];$('message').textContent=label?label+' sent to firmware.':'Command accepted.';if(a.action==='control')$('controlMessage').textContent=$('message').textContent;}catch(e){$('message').textContent=e.message;if(a.action==='control')$('controlMessage').textContent=e.message;}}
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{action({action:b.dataset.action});});
$('serialForm').onsubmit=e=>{e.preventDefault();action({action:'serial',text:$('serialInput').value});$('serialInput').value='';};
$('upload').onclick=async()=>{try{const file=$('firmware').files[0];if(!file)throw Error('Select a .bin file first');if(file.size>4194304)throw Error('Maximum flash size is 4 MB');const r=await fetch('/qemu/flash',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});const d=await r.json();if(!r.ok)throw Error(d.error);$('message').textContent='Virtual flash written. SHA-256: '+d.sha256;}catch(e){$('message').textContent=e.message;}};
let uartBaseline=null,uartState=null;
try{uartBaseline=JSON.parse(localStorage.getItem('arena-uart-clear'));}catch{}
function renderUart(s){
 uartState=s;let text=s.serial;
 if(uartBaseline?.started===s.started&&uartBaseline.marker){
  const at=text.indexOf(uartBaseline.marker);
  if(at>=0)text=text.slice(at+uartBaseline.marker.length);
 }
 if(serial!==text){serial=text;$('logs').textContent=text||'Log cleared. Waiting for new UART output...';$('logs').scrollTop=$('logs').scrollHeight;}
}
fetch('/uart-clear.json',{cache:'no-store'}).then(r=>r.json()).then(b=>{
 if(!uartBaseline||b.time>uartBaseline.time)uartBaseline=b;
 if(uartState)renderUart(uartState);
}).catch(()=>{});
$('clearUart').onclick=()=>{
 if(!uartState)return;
 uartBaseline={started:uartState.started,marker:uartState.serial.slice(-300),time:Date.now()};
 try{localStorage.setItem('arena-uart-clear',JSON.stringify(uartBaseline));}catch{}
 serial=null;renderUart(uartState);
};
const events=new EventSource('/qemu/events');events.onmessage=e=>{const s=JSON.parse(e.data);const boot=String(s.started)+':'+s.bootCount;if(lastBoot!==boot||!s.running)firmwareDisplay=null;lastBoot=boot;renderLeds(s);$('wifiMode').textContent=s.running?(s.wifi?.mode||'Starting'):'ESP32 powered off';if(s.wifi?.mode?.startsWith('Connected to virtual router')&&!lastWifiMode?.startsWith('Connected to virtual router'))$('guestFrame').src=guestUrl.href;lastWifiMode=s.wifi?.mode;$('state').textContent=s.mode;$('engine').textContent=s.engine;$('diagnosis').textContent=s.diagnosis||'Upload your firmware to begin.';$('image').textContent=s.imageName+(s.firmwareReady?' · build ready':' · build missing');$('boots').textContent='Boots: '+s.bootCount;$('powerLed').classList.toggle('on',s.running);renderUart(s);document.querySelector('[data-action=start]').disabled=s.running||!s.firmwareReady;document.querySelector('[data-action=stop]').disabled=!s.running;};events.onerror=()=>$('message').textContent='Dashboard server disconnected';

let lastWifiMode=null;
let firmwareDisplay=null,lastBoot=null;
window.addEventListener('message',event=>{
 if(event.origin!==guestUrl.origin||event.source!==$('guestFrame').contentWindow||event.data?.type!=='arena-firmware-display')return;
 const value=String(event.data.text).trim();
 if(!/^(?:\d{1,2}:\d{2}|\d{1,2})$/.test(value))return;
 firmwareDisplay=value;draw();
});

const guestUrl=new URL(window.location.href);guestUrl.port='8758';guestUrl.pathname='/';guestUrl.search='';guestUrl.hash='';$('guestLink').href=guestUrl.href;$('guestFrame').src=guestUrl.href;

$('reloadGuest').onclick=()=>{firmwareDisplay=null;$('guestFrame').src=guestUrl.href;draw();};

const canvas=$("display"),ctx=canvas.getContext("2d");let snapshot=null;
function color(buffer,index){if(!snapshot?.powered||snapshot.bootloader)return '#0d1013';return '#'+(buffer?.slice(index*6,index*6+6)||'000000');}
// Collapse each physical LED group into one solid diffuser color.
function segmentColor(colors){
 const counts=new Map();
 for(const color of colors)counts.set(color,(counts.get(color)||0)+1);
 return [...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]||'#000000';
}
function face(points, colors){
 ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();
 const color=segmentColor(colors),lit=color!=='#000000'&&color!=='#0d1013';
 ctx.fillStyle=lit?color:'#15151a';ctx.shadowColor=lit?color:'transparent';ctx.shadowBlur=lit?8:0;ctx.fill();ctx.shadowBlur=0;
 ctx.strokeStyle='#090a10';ctx.lineWidth=2;ctx.stroke();
}
function draw(){
 ctx.clearRect(0,0,1000,340);ctx.fillStyle='#111117';ctx.fillRect(0,0,1000,340);
 const s=snapshot?.device||{},offset=Number($('side').value)*171;
 ctx.globalAlpha=snapshot?.powered?Math.max(.12,(s.brightness||127)/230):.4;
 const digit=i=>i<101?color(s.digits,offset+i):color(s.border,offset+70+i-101);
 const border=i=>i<70?color(s.border,offset+i):color(s.digits,offset+101+i-70);
 // Four solid L-shaped sections, separated at the enclosure joints.
 const borderSections=[
  [[490,22],[40,22],[40,160]],
  [[40,182],[40,322],[490,322]],
  [[510,322],[960,322],[960,182]],
  [[960,160],[960,22],[510,22]],
 ];
 borderSections.forEach((points,section)=>{
  const color=segmentColor(Array.from({length:35},(_,i)=>border(section*35+i)));
  ctx.strokeStyle=color;ctx.lineWidth=24;ctx.lineCap='butt';ctx.lineJoin='round';ctx.shadowColor=color;ctx.shadowBlur=8;
  ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();
 });
 ctx.shadowBlur=0;
 const synced=$('clockSource').value==='firmware'&&firmwareDisplay!==null;
 canvas.setAttribute('role','img');
 canvas.setAttribute('aria-label',synced?'Timer '+firmwareDisplay:'Raw firmware LED display');
 const text=firmwareDisplay?.includes(':')?firmwareDisplay.replace(':','').padStart(4,'0'):firmwareDisplay?.padStart(4,'0');
 const masks=[0x3f,0x06,0x5b,0x4f,0x66,0x6d,0x7d,0x07,0x7f,0x6f];
 // Keep firmware LED color; use its web page's displayed value for synchronized segments.
 let ink='#ffb830';
 for(let i=0;i<196;i++){const c=digit(i<98?i:i+3);if(c!=='#000000'&&c!=='#0d1013'){ink=c;break;}}
 const positions=[92,286,558,752],offsets=[0,49,150,101],flip=[3,4,5,0,1,2,6];
 const shapes=[[[5,0],[145,0],[119,26],[31,26]],[[147,3],[147,105],[132,120],[119,106],[119,29]],[[132,130],[147,145],[147,247],[119,221],[119,144]],[[5,250],[31,224],[119,224],[145,250]],[[2,145],[17,130],[30,144],[30,221],[2,247]],[[2,3],[30,29],[30,106],[17,120],[2,105]],[[19,125],[33,111],[117,111],[130,125],[117,139],[33,139]]];
 for(let d=0;d<4;d++)for(let seg=0;seg<7;seg++){
  const x=positions[d],y=47,physical=d<2?seg:flip[seg],colors=Array.from({length:7},(_,j)=>digit(offsets[d]+physical*7+j));
  if(synced)colors.fill(snapshot?.powered&&(masks[Number(text[d])]&(1<<seg))?ink:'#0d1013');
  face(shapes[seg].map(([a,b])=>[x+a,y+b]),colors);
 }
 for(const [y,start] of [[121,98],[223,199]]){
  const colors=Array.from({length:3},(_,j)=>digit(start+j));
  if(synced)colors.fill(snapshot?.powered?ink:'#0d1013');
  const points=Array.from({length:48},(_,i)=>[510+16*Math.cos(i*Math.PI/24),y+16*Math.sin(i*Math.PI/24)]);
  face(points,colors);
 }
 ctx.shadowBlur=0;ctx.globalAlpha=1;
 $('ledStatus').textContent=synced?'FIRMWARE WEB TIMER / SYNCHRONIZED':$('clockSource').value==='firmware'?'WAITING FOR FIRMWARE TIMER':'RAW RMT LED OUTPUT';
}


function renderLeds(s){snapshot={powered:s.running,device:{digits:s.leds?.[5],border:s.leds?.[17],brightness:230}};draw();document.querySelectorAll('[data-command]').forEach(b=>b.disabled=!s.running||s.paused);}
$('side').onchange=draw;
$('clockSource').onchange=draw;
document.querySelectorAll('[data-command]').forEach(b=>b.onclick=()=>action({action:'control',command:b.dataset.command}));draw();
