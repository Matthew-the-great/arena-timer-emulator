import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {adaptGuestHtml,displayBridge} from './guest-display.mjs';

test('guest timer bridge forwards initial value and every actual display change',()=>{
 const sent=[];let observer;
 const el={textContent:'02:00'};
 const parent={postMessage:(data,origin)=>sent.push({data,origin})};
 vm.runInNewContext(displayBridge.replace('<script>','').replace('</script>',''),{
  window:{parent},parent,location:{href:'http://localhost:8758/'},URL,
  document:{referrer:'http://localhost:8757/emulator',getElementById:()=>el},
  MutationObserver:class{constructor(fn){observer=fn;}observe(){}},
 });
 for(const value of ['3','2','1','01:59','01:58']){el.textContent=value;observer();}
 assert.deepEqual(sent.map(x=>x.data.text),['02:00','3','2','1','01:59','01:58']);
 assert.ok(sent.every(x=>x.origin==='http://localhost:8757'));
});
test('relay preserves firmware HTML and adapts socket plus dashboard bridge',()=>{
 const original='<body><div id="countdown">02:00</div>ws://${window.location.hostname}:81/</body>';
 const html=adaptGuestHtml(original);
 assert.ok(html.includes('ws://${window.location.host}/ws'));
 assert.ok(html.includes('<div id="countdown">02:00</div>'));
 assert.ok(html.includes(displayBridge+'</body>'));
});
