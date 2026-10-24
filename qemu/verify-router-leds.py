import urllib.request,json,time,pathlib
base='http://127.0.0.1:'
def get(port,path):return urllib.request.urlopen(base+str(port)+path,timeout=15).read()
for i in range(100):
 s=json.loads(get(8757,'/qemu/state'))
 if 'WiFi Connected successfully' in s['serial'] and s['ledFrames']>=2:break
 time.sleep(1)
else:raise RuntimeError('Network and LEDs not ready')
status=json.loads(get(8758,'/status'));original=status['digitColor']
try:
 get(8758,'/setcolor?hex=00FF00')
 for i in range(30):
  after=json.loads(get(8757,'/qemu/state'))
  if after['ledFrames']>s['ledFrames'] and after['leds'].get('5')!=s['leds'].get('5'):break
  time.sleep(1)
 else:raise RuntimeError('LEDs did not change')
 print('PASS connected guest, HTTP color control, live RMT output',flush=True)
 pathlib.Path('ArenaTimerSimulator/qemu/verification/router-leds.json').write_text(json.dumps({'ssid':status['wifiSSID'],'ip':status['myIP'],'frames':after['ledFrames'],'pixels':{k:len(v)//6 for k,v in after['leds'].items()}},indent=2))
finally:get(8758,'/setcolor?hex='+original)
