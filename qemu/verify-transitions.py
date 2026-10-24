import urllib.request,json,time,re,pathlib
base='http://127.0.0.1:8757'
def state():return json.load(urllib.request.urlopen(base+'/qemu/state',timeout=5))
def action(cmd):
 req=urllib.request.Request(base+'/qemu/action',data=json.dumps({'action':'control','command':cmd}).encode(),headers={'Content-Type':'application/json'})
 return json.load(urllib.request.urlopen(req,timeout=5))
action('reset');time.sleep(2);action('start')
for i in range(90):
 before=state();action('pause');time.sleep(2);after=state();tail=after['serial'][len(before['serial']):]
 print(tail,flush=True)
 if "'pause' | Current State is: 4" in tail:break
else:raise AssertionError('Never reached RUNNING')
before=state();action('reset');time.sleep(3);after=state();tail=after['serial'][len(before['serial']):];print(tail,flush=True);assert "'reset' | Current State is: 5" in tail
before=state();action('switch');time.sleep(3);after=state();tail=after['serial'][len(before['serial']):];print(tail,flush=True);assert "'switch' | Current State is: 1" in tail
action('switch');time.sleep(3)
p=pathlib.Path('ArenaTimerSimulator/qemu/verification/led-controls-result.json');data=json.loads(p.read_text());data['transitions']={'runningToPause':True,'pausedToIdle':True,'idleTimeSelection':True};p.write_text(json.dumps(data,indent=2));print('PASS transitions',flush=True)
