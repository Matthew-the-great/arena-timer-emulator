import urllib.request,json,time,pathlib
for i in range(80):
 s=json.load(urllib.request.urlopen('http://127.0.0.1:8757/qemu/state',timeout=5))
 if 'WiFi Connected successfully' in s['serial']:
  status=json.load(urllib.request.urlopen('http://127.0.0.1:8758/status',timeout=15))
  assert status['wifiSSID']=='ArenaTimer-Virtual' and status['myIP']=='192.168.4.3'
  pathlib.Path('ArenaTimerSimulator/qemu/verification/router-status.json').write_text(json.dumps(status,indent=2))
  print('PASS saved credentials, WPA2, DHCP and guest HTTP after cold restart',flush=True);break
 time.sleep(1)
else:raise RuntimeError('Guest did not connect')
