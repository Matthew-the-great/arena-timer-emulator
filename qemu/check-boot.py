"""Bounded boot test of the existing, unchanged ArenaTimer flash image."""
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import argparse
import struct
import socket
import json
import sys
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--app', type=Path, help='Test an ESP32 application bin in a disposable stock flash image')
parser.add_argument('--seconds', type=int, default=15)
parser.add_argument('--experimental-capture', action='store_true', help='Enable inferred FE capture with ideal zero input; not calibrated radio emulation')
parser.add_argument('--http-probe', action='store_true', help='Test the actual guest HTTP server through loopback-only port forwarding')
parser.add_argument('--trace-wifi', action='store_true', help='Record at most 10000 experimental MAC register writes')
parser.add_argument('--virtual-mac', help='Provision a disposable eFuse image with this base MAC, e.g. 02:00:00:87:57:00')
parser.add_argument('--station-password', help='Password for the virtual station to join the guest AP')
parser.add_argument('--label', default='custom', help='Prefix for test evidence files (letters, digits, hyphen only)')
args = parser.parse_args()
if not args.label or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in args.label):
    parser.error('Invalid evidence label')

def snapshot_monitor(port, reset=False):
    with socket.create_connection(('127.0.0.1', port), timeout=3) as conn:
        stream = conn.makefile('rwb')
        stream.readline()
        def request(command):
            stream.write(json.dumps(command).encode() + b'\n')
            stream.flush()
            while True:
                reply = json.loads(stream.readline())
                if 'return' in reply or 'error' in reply:
                    return reply
        request({'execute': 'qmp_capabilities'})
        if reset:
            return request({'execute': 'system_reset'})
        request({'execute': 'stop'})
        return request({'execute': 'human-monitor-command',
                        'arguments': {'command-line': 'info registers -a'}})

root = Path(__file__).resolve().parent
binary = Path(os.environ['LOCALAPPDATA']) / 'arena-qemu-build/qemu-system-xtensa.exe'
stock = root / 'firmware/boot.merged.bin'
before = hashlib.sha256(stock.read_bytes()).hexdigest()
env = dict(os.environ, PATH=r'C:\msys64\ucrt64\bin;' + os.environ['PATH'])
with tempfile.TemporaryDirectory(prefix='arena-boot-') as temp:
    flash = Path(temp) / 'flash.bin'
    shutil.copyfile(stock, flash)
    if args.app:
        app = args.app.read_bytes()
        if len(app) < 24 or app[0] != 0xe9 or struct.unpack_from('<H', app, 12)[0] != 0:
            raise ValueError('Expected a classic ESP32 application image')
        data = bytearray(flash.read_bytes())
        for offset in range(0x8000, 0x9000, 32):
            magic, kind, subtype, start, size = struct.unpack_from('<HBBII', data, offset)
            if magic == 0x50aa and kind == 0:
                if len(app) > size:
                    raise ValueError('Application exceeds stock application partition')
                data[start:start+size] = b'\xff' * size
                data[start:start+len(app)] = app
                break
        else:
            raise ValueError('No application partition found')
        flash.write_bytes(data)
        print('Application SHA256:', hashlib.sha256(app).hexdigest())
    command = [str(binary), '-machine', 'esp32', '-display', 'none', '-monitor', 'none',
        '-serial', 'stdio', '-nic', 'user,model=esp32_wifi,restrict=on', '-accel', 'tcg,thread=single', '-icount', 'shift=3', '-L', str(root / '../.tools/qemu/qemu/share/qemu'),
        '-drive', f'file={flash.as_posix()},if=mtd,format=raw']
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        monitor_port = probe.getsockname()[1]
    command += ['-qmp', f'tcp:127.0.0.1:{monitor_port},server=on,wait=off']
    if args.experimental_capture:
        command += ['-global', 'driver=esp32.fe,property=experimental-capture,value=on']
    if args.virtual_mac:
        mac = bytes.fromhex(args.virtual_mac.replace(':', ''))
        if len(mac) != 6 or mac[0] & 1:
            raise ValueError('Expected a six-byte unicast MAC')
        # ESP32 factory MAC: BLK0 bits 32..79, CRC bits 80..87.
        # CRC-8/MAXIM, matching Espressif espefuse's calc_crc.
        crc = 0
        for byte in mac:
            crc ^= byte
            for _ in range(8):
                crc = (crc >> 1) ^ (0x8c if crc & 1 else 0)
        efuse_data = bytearray(124)
        efuse_data[4:10] = mac[::-1]
        efuse_data[10] = crc
        efuse = Path(temp) / 'efuse.bin'
        efuse.write_bytes(efuse_data)
        command += ['-drive', f'file={efuse.as_posix()},if=none,format=raw,id=efuse',
                    '-global', 'driver=nvram.esp32.efuse,property=drive,value=efuse']
    if args.trace_wifi:
        command += ['-global', 'driver=esp32_wifi,property=trace-mmio,value=on',
                    '-D', str(root / f'verification/{args.label}-wifi-mmio.log')]
    if args.station_password:
        command += ['-global', 'driver=esp32_wifi,property=station-password,value=' + args.station_password.replace(',', ',,')]
    http_ok = False
    if args.http_probe:
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', 0))
            http_port = probe.getsockname()[1]
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', 0))
            ws_port = probe.getsockname()[1]
        command[command.index('-nic') + 1] = (
            'user,model=esp32_wifi,restrict=on,net=192.168.4.0/24,host=192.168.4.2,'
            'dhcpstart=192.168.4.3,dns=192.168.4.254,'
            f'hostfwd=tcp:127.0.0.1:{http_port}-192.168.4.1:80,'
            f'hostfwd=tcp:127.0.0.1:{ws_port}-192.168.4.1:81')
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env)
    try:
        output, _ = process.communicate(timeout=args.seconds)
    except subprocess.TimeoutExpired:
        if args.http_probe:
            try:
                opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
                with opener.open(f'http://127.0.0.1:{http_port}/', timeout=5) as response:
                    page = response.read(1024 * 1024)
                    http_ok = response.status == 200 and b'<html' in page.lower()
                    (root / f'verification/{args.label}-guest-http.html').write_bytes(page)
                    print('Guest HTTP:', response.status, len(page), 'bytes')
                with opener.open(f'http://127.0.0.1:{http_port}/status', timeout=5) as response:
                    status = json.loads(response.read())
                    print('Guest status JSON:', len(status), 'fields')
                with socket.create_connection(('127.0.0.1', ws_port), timeout=5) as ws:
                    ws.sendall(b'GET / HTTP/1.1\r\nHost: 192.168.4.1:81\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n')
                    handshake = b''
                    while b'\r\n\r\n' not in handshake and len(handshake) < 8192:
                        chunk=ws.recv(4096)
                        if not chunk: break
                        handshake+=chunk
                    if b'101 Switching Protocols' not in handshake or b's3pPLMBiTxaQ9kYGzzhZRbK+xOo=' not in handshake:
                        raise ValueError('Guest WebSocket handshake failed')
                    print('Guest WebSocket: valid 101 upgrade')
            except (OSError, ValueError) as error:
                http_ok = False
                print('Guest HTTP unavailable:', error)
        try:
            registers = snapshot_monitor(monitor_port)
            (root / f'verification/{args.label}-boot-registers.json').write_text(json.dumps(registers, indent=2))
        except (OSError, ValueError) as error:
            print('Could not capture CPU state:', error)
        process.kill()
        output, _ = process.communicate(timeout=5)
    (root / f'verification/{args.label}-boot.txt').write_bytes(output)
    print(output.decode(errors='replace')[-12000:])
assert hashlib.sha256(stock.read_bytes()).hexdigest() == before
print('Unchanged firmware SHA256:', before)
decoded = output.decode(errors='replace')
if 'Guru Meditation Error' in decoded or 'panic\'ed' in decoded:
    print('FAIL: guest panicked; Wi-Fi boot did not succeed.')
    sys.exit(1)
if 'AP IP Address:' not in decoded:
    print('INCOMPLETE: no ArenaTimer access-point startup marker within test duration.')
    sys.exit(2)
print('Access-point startup marker observed. Network traffic/HTTP still require separate verification.')
if args.http_probe and http_ok:
    print('PASS: guest HTTP returned 200 and HTML through emulated Wi-Fi.')
if args.http_probe and not http_ok:
    print('FAIL: guest access-point startup completed, but HTTP traffic did not succeed.')
    sys.exit(3)
