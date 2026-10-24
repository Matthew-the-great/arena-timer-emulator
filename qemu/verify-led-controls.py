import urllib.request,json,time,pathlib
base='http://127.0.0.1:8757'
def state():return json.load(urllib.request.urlopen(base+'/qemu/state',timeout=5))
def action(cmd):
 req=urllib.request.Request(base+'/qemu/action',data=json.dumps({'action':'control','command':cmd}).encode(),headers={'Content-Type':'application/json'})
 return json.load(urllib.request.urlopen(req,timeout=5))
for i in range(120):
 s=state()
 if 'Starting Access Point mode...' in s['serial'] and s['serial'].count('AP IP Address:')>=2 and s['ledFrames']>0:break
 time.sleep(1)
else:raise AssertionError('Guest did not finish its connection timeout')
print('Guest ready, LED frames:',s['ledFrames'],flush=True)
result={}
for cmd in ['reset','start','pause','reset','switch','switch','blue','red']:
 before=state();action(cmd);time.sleep(4);after=state()
 tail=after['serial'][len(before['serial']):]
 print(cmd,tail,flush=True)
 assert '[SERIAL' in tail,(cmd,tail)
 result[cmd]={'uart':tail,'frames':after['ledFrames']}
assert after['ledFrames']>s['ledFrames']
assert all(len(v)==342*6 for v in after['leds'].values())
pathlib.Path('ArenaTimerSimulator/qemu/verification/led-controls-result.json').write_text(json.dumps(result,indent=2))
print('PASS UART buttons and RMT display',flush=True)
