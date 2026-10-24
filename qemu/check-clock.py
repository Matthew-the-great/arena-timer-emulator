"""Clock/LED verification; --refresh requests redraws using the current digit color."""
import urllib.request,json,time,pathlib,sys
refresh="--refresh" in sys.argv
color=json.load(urllib.request.urlopen("http://127.0.0.1:8758/status",timeout=15))["digitColor"] if refresh else None
start=time.monotonic();frames=[];last=None
while time.monotonic()-start<45:
 if refresh:
  urllib.request.urlopen('http://127.0.0.1:8758/setcolor?hex='+color,timeout=15).close()
 s=json.load(urllib.request.urlopen('http://127.0.0.1:8757/qemu/state',timeout=4))
 m=s.get('ledMeta',{}).get('5',{})
 if m and m!=last:
  frames.append(m);last=m
 time.sleep(1)
assert len(frames)>10, 'Not enough live LED frames'
ratio=(frames[-1]['ns']-frames[0]['ns'])/1e6/(frames[-1]['received']-frames[0]['received'])
result={'virtualWallRatio':ratio,'samples':len(frames),'bootCount':s['bootCount'],'frames':s['ledFrames'],'rejectedFrames':s['rejectedLedFrames'],'rceSubscribed':'[RCE] subscribed' in s['serial']}
pathlib.Path(__file__).with_name('verification').joinpath('clock-check.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2),flush=True)
assert .98<ratio<1.02, 'Virtual clock is drifting'
assert s['bootCount']==1, 'Guest rebooted'
assert s['rejectedLedFrames']==0, 'Malformed LED frames received'
