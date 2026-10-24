const $=id=>document.getElementById(id),canvas=$('display'),ctx=canvas.getContext('2d');let snapshot=null,logText='',wasAvailable=true,sound=false,audio=null,osc=null,gain=null,lastTone=false;
async function action(data){try{const r=await fetch('/sim/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(!r.ok)throw Error(await r.text());}catch(e){$('toast').hidden=false;$('toast').textContent=e.message;setTimeout(()=>$('toast').hidden=true,4000);}}
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>action({action:b.dataset.action}));document.querySelectorAll('[data-local]').forEach(b=>b.onclick=()=>action({action:'local',command:b.dataset.local}));document.querySelectorAll('[data-role]').forEach(b=>{if(b.id!=='horn')b.onclick=()=>action({action:'remote',role:b.dataset.role,command:b.dataset.command});});
let hornInterval;function stopHorn(){clearInterval(hornInterval);hornInterval=null;}$('horn').onpointerdown=e=>{e.preventDefault();$('horn').setPointerCapture(e.pointerId);action({action:'remote',role:'judge',command:'horn'});hornInterval=setInterval(()=>action({action:'remote',role:'judge',command:'horn'}),150);};for(const ev of ['pointerup','pointercancel','lostpointercapture'])$('horn').addEventListener(ev,stopHorn);window.addEventListener('blur',stopHorn);$('horn').onkeydown=e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat)action({action:'remote',role:'judge',command:'horn'});};
$('radio').onchange=()=>action({action:'radio',value:$('radio').value});$('lora').onchange=()=>action({action:'lora'});$('reload').onclick=()=>{$('device').src='/device';};$('side').onchange=()=>draw();
$('sound').onclick=async()=>{audio??=new AudioContext();await audio.resume();sound=!sound;$('sound').textContent=sound?'Mute PC sound':'Enable PC sound';updateAudio();};
function updateAudio(){const tone=sound&&snapshot?.powered&&snapshot.device.tone;if(tone&&!osc){osc=audio.createOscillator();gain=audio.createGain();osc.type='square';osc.frequency.value=2000;gain.gain.value=.025;osc.connect(gain).connect(audio.destination);osc.start();}else if(!tone&&osc){osc.stop();osc.disconnect();osc=null;}}
document.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName)||e.ctrlKey||e.altKey||e.metaKey||e.repeat)return;const commands={s:'start',p:'pause',x:'reset',t:'switch',r:'readyRed',b:'readyBlue'};if(commands[e.key.toLowerCase()]){e.preventDefault();action({action:'local',command:commands[e.key.toLowerCase()]});}});
function color(buffer,index){if(!snapshot?.powered||snapshot.bootloader)return '#0d1013';return '#'+(buffer?.slice(index*6,index*6+6)||'000000');}
// Diffuser faces follow the physical enclosure; colors still come from firmware LEDs.
function face(points, colors, from, to){
 ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();
 const lit=colors.some(c=>c!=='#000000'&&c!=='#0d1013');
 const gradient=ctx.createLinearGradient(...from,...to);
 colors.forEach((c,i)=>gradient.addColorStop(i/Math.max(1,colors.length-1),c==='#000000'||c==='#0d1013'?'#15151a':c));
 ctx.fillStyle=gradient;ctx.shadowColor=lit?colors[Math.floor(colors.length/2)]:'transparent';ctx.shadowBlur=lit?12:0;ctx.fill();ctx.shadowBlur=0;
 ctx.strokeStyle='#090a10';ctx.lineWidth=2;ctx.stroke();
}
function draw(){
 ctx.clearRect(0,0,1000,340);ctx.fillStyle='#111117';ctx.fillRect(0,0,1000,340);
 const s=snapshot?.device||{},offset=Number($('side').value)*171;
 ctx.globalAlpha=snapshot?.powered?Math.max(.12,(s.brightness||127)/230):.4;
 const digit=i=>i<101?color(s.digits,offset+i):color(s.border,offset+70+i-101);
 const border=i=>i<70?color(s.border,offset+i):color(s.digits,offset+101+i-70);
 // Continuous diffused border, with the four black enclosure joints in the photo.
 const perimeter=2440;
 for(let i=0;i<140;i++){
  const d=(i/140*perimeter+460)%perimeter;
  const point=v=>{v=(v+perimeter)%perimeter;if(v<920)return [960-v,22];if(v<1220)return [40,22+v-920];if(v<2140)return [40+v-1220,322];return [960,322-v+2140];};
  const [x,y]=point(d),[xx,yy]=point(d+perimeter/140+1);
  ctx.strokeStyle=border(i);ctx.lineWidth=24;ctx.lineCap='round';ctx.shadowColor=border(i);ctx.shadowBlur=12;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(xx,yy);ctx.stroke();
 }
 ctx.shadowBlur=0;ctx.fillStyle='#111117';ctx.fillRect(493,5,14,34);ctx.fillRect(493,305,14,34);ctx.fillRect(22,165,36,12);ctx.fillRect(942,165,36,12);
 const positions=[92,286,558,752],offsets=[0,49,150,101],flip=[3,4,5,0,1,2,6];
 const shapes=[[[5,0],[145,0],[119,26],[31,26]],[[147,3],[147,105],[132,120],[119,106],[119,29]],[[132,130],[147,145],[147,247],[119,221],[119,144]],[[5,250],[31,224],[119,224],[145,250]],[[2,145],[17,130],[30,144],[30,221],[2,247]],[[2,3],[30,29],[30,106],[17,120],[2,105]],[[19,125],[33,111],[117,111],[130,125],[117,139],[33,139]]];
 for(let d=0;d<4;d++)for(let seg=0;seg<7;seg++){
  const x=positions[d],y=47,physical=d<2?seg:flip[seg],colors=Array.from({length:7},(_,j)=>digit(offsets[d]+physical*7+j));
  const horizontal=[0,3,6].includes(seg);face(shapes[seg].map(([a,b])=>[x+a,y+b]),colors,[x,y],[x+(horizontal?147:0),y+(horizontal?0:250)]);
 }
 for(const [y,start] of [[121,98],[223,199]]){
  const colors=Array.from({length:3},(_,j)=>digit(start+j));
  const points=Array.from({length:48},(_,i)=>[510+16*Math.cos(i*Math.PI/24),y+16*Math.sin(i*Math.PI/24)]);
  face(points,colors,[494,y],[526,y]);
 }
 ctx.shadowBlur=0;ctx.globalAlpha=1;
}

function render(data){snapshot=data;const s=data.device;const available=data.powered&&!data.bootloader&&data.network;$('deviceOffline').hidden=available;if(available&&!wasAvailable)$('device').src='/device';wasAvailable=available;
 $('connection').textContent=data.powered?(data.bootloader?'DOWNLOAD MODE':'FIRMWARE RUNNING'):'POWER OFF';$('state').textContent=data.powered?(data.bootloader?'ROM DOWNLOAD':s.state):'POWER OFF';$('uptime').textContent='UPTIME '+Math.floor((s.millis||0)/1000)+'s';$('readout').textContent=s.currentTime+' · '+s.duration+'s match';$('power').textContent=data.powered?'Disconnect power':'Connect power';$('network').textContent=data.network?'Disconnect virtual Wi-Fi':'Restore virtual Wi-Fi';$('lora').checked=s.loraRadioPresent;$('radio').value=data.radio;
 for(const [id,on] of [['powerLed',data.powered],['wifiLed',available],['buzzerLed',data.powered&&s.tone],['relayLed',data.powered&&s.relay]])$(id).classList.toggle('on',!!on);
 $('buzzer').textContent=s.tone&&data.powered?'2 kHz buzzer active':'Buzzer off';$('relay').textContent=s.relay&&data.powered?'Relay HIGH':'Relay LOW';
 for(const role of ['red','blue','judge'])$(role+'Binding').textContent=s[role]?'PAIRED · '+[s[role+'EspNow']?'ESP-NOW':'',s[role+'Lora']?'LoRa':''].filter(Boolean).join(' + '):'NOT PAIRED';for(const role of ['red','blue']){$(role+'Ready').textContent=s[role+'Ready']?'READY':'NOT READY';$(role+'Ready').style.color=s[role+'Ready']?'#6de3a0':'#8ea0b6';}
 const text=data.logs.map(l=>l.at+'  '+l.message).join('\n');if(text!==logText){logText=text;$('logs').textContent=text;$('logs').scrollTop=$('logs').scrollHeight;}draw();updateAudio();
}
const stream=new EventSource('/events');stream.onmessage=e=>render(JSON.parse(e.data));stream.onerror=()=>{$('connection').textContent='SERVER DISCONNECTED';if(osc){osc.stop();osc=null;}};draw();
