"""Exercise the real QEMU MMIO interface, without changing guest firmware."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading

ROOT = Path(__file__).resolve().parent
BINARY = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(os.environ['LOCALAPPDATA']) / 'arena-qemu-build/qemu-system-xtensa.exe'
env = dict(os.environ, PATH=r'C:\msys64\ucrt64\bin;' + os.environ['PATH'])
with tempfile.TemporaryDirectory(prefix='arena-qtest-') as temp:
    telemetry = Path(temp) / 'rmt.jsonl'
    wifi_trace = Path(temp) / 'wifi.log'
    flash = Path(temp) / 'flash.bin'
    flash.write_bytes(b'\xff' * 4194304)
    process = subprocess.Popen([str(BINARY), '-machine', 'esp32', '-accel', 'qtest',
        '-L', str(ROOT / '../.tools/qemu/qemu/share/qemu'), '-display', 'none',
        '-serial', 'none', '-monitor', 'none', '-qtest', 'stdio',
        '-nic', 'user,model=esp32_wifi,restrict=on',
        '-global', 'driver=esp32.rmt,property=refill-pacing,value=' + ('on' if os.environ.get('ARENA_TEST_PACING') else 'off'),
        '-global', 'driver=esp32_wifi,property=trace-mmio,value=on',
        '-D', str(wifi_trace),
        '-drive', f'file={flash.as_posix()},if=mtd,format=raw',
        '-chardev', f'file,id=rmt,path={telemetry.as_posix()}',
        '-global', 'driver=esp32.rmt,property=telemetry,value=rmt',
        '-global', 'driver=esp32.fe,property=experimental-capture,value=on'], stdin=subprocess.PIPE,
        stdout=subprocess.PIPE, stderr=open(ROOT / 'verification/qtest-stderr.txt', 'w'),
        text=True, env=env)
    watchdog = threading.Timer(30, process.kill)
    watchdog.start()
    def command(text):
        process.stdin.write(text + '\n')
        process.stdin.flush()
        while True:
            line = process.stdout.readline()
            if not line:
                raise RuntimeError('QEMU stopped during ' + text)
            if line.startswith('OK'):
                return line.strip()
            if line.startswith('FAIL'):
                raise RuntimeError(line)
    base = 0x3ff56000
    def write(offset, value):
        command(f'writel {base+offset:#x} {value:#x}')
    def read(offset):
        return int(command(f'readl {base+offset:#x}').split()[1], 16)
    try:
        # A rejected association response must not advance to DHCP.
        packet = bytearray(36)
        packet[0] = 0x10  # Management association response.
        packet[26] = 40  # Invalid information element, nonzero failure status.
        for offset in range(0, len(packet), 4):
            value = int.from_bytes(packet[offset:offset+4], 'little')
            command(f'writel {0x3ffb0100+offset:#x} {value:#x}')
        command('writel 0x3ffb0000 0x80024024')
        command('writel 0x3ffb0004 0x3ffb0100')
        command('writel 0x3ffb0008 0')
        command('writel 0x3ff73d20 0xc00b0000')
        command('clock_step 10000000')
        wifi_log = wifi_trace.read_text()
        assert 'association response status=40' in wifi_log
        assert 'wifi RX' not in wifi_log, 'Rejected association incorrectly sent DHCP'
        # Experimental radio register storage, not calibration completion.
        # DPORT/APB aliases must share each bank; banks must remain independent.
        radio_bases = (0x3ff45000, 0x3ff46000, 0x3ff51000, 0x3ff5c000, 0x3ff5d000, 0x3ff71000, 0x3ff74000, 0x3ff75000)
        for index, address in enumerate(radio_bases):
            assert int(command(f'readl {address+0x1c:#x}').split()[1], 16) == 0
            command(f'writel {address+0x1c:#x} {0x12340000+index:#x}')
        for index, address in enumerate(radio_bases):
            alias = address - 0x3ff40000 + 0x60000000
            assert int(command(f'readl {alias+0x1c:#x}').split()[1], 16) == 0x12340000+index
        for address in (0x3ff75144, 0x60035144):
            samples = {command(f'readl {address:#x}') for _ in range(8)}
            assert len(samples) > 1, 'WDEV bank hid the hardware RNG'
        assert int(command('readl 0x3ff4607c').split()[1], 16) == 0, 'Must not invent calibration completion'
        def capture_read():
            return int(command('readl 0x3ff4607c').split()[1], 16)
        command('writel 0x3ff4607c 0x80000000')
        assert capture_read() == 0, 'Guest cannot write completion status'
        command('writel 0x3ff4607c 0xf')  # Four samples, enabled and started.
        command('clock_step 3999')
        assert capture_read() == 0xf
        command('clock_step 1')
        assert capture_read() == 0x8000000f
        command('writel 0x3ff4607c 0xd')  # Stop clears done.
        assert capture_read() == 0xd
        command('writel 0x3ff4607c 0xf')
        command('clock_step 1000')
        command('writel 0x3ff4607c 0')  # Cancel pending capture.
        command('clock_step 4000')
        assert capture_read() == 0
        assert int(command('readl 0x3ff000cc').split()[1], 16) == 0xfffce030
        command('writel 0x3ff000cc 0x12345678')
        assert int(command('readl 0x3ff000cc').split()[1], 16) == 0x12345678
        # Exercise the real GigaDevice SPI command path used by ESP-IDF.
        def spi(opcode, data=None, bits=8, receive=False):
            def reg(offset, value):
                command(f'writel {0x3ff42000+offset:#x} {value:#x}')
            reg(0x1c, (1 << 31) | ((1 << 27) if data is not None else 0) | ((1 << 28) if receive else 0))
            reg(0x24, (7 << 28) | opcode)
            reg(0x28, bits-1)
            reg(0x2c, bits-1)
            reg(0x80, data or 0)
            reg(0, 1 << 18)
            return int(command('readl 0x3ff42080').split()[1], 16)
        assert spi(0x9f, bits=24, receive=True) & 0xffffff == 0x1640c8
        # Full-duplex RX must use the byte index, not the MOSI data value.
        assert spi(0x9f, data=0xffffff, bits=24, receive=True) & 0xffffff == 0x1640c8
        assert spi(0x35, receive=True) & 2 == 0
        spi(0x06)
        spi(0x31, data=2)
        assert spi(0x35, receive=True) & 2
        spi(0x04)
        spi(0x31, data=0)  # Must not write while WEL is clear.
        assert spi(0x35, receive=True) & 2
        spi(0x06)
        spi(0x31, data=0)
        assert spi(0x35, receive=True) & 2 == 0
        spi(0x06)
        spi(0x01, data=0x200, bits=16)
        assert spi(0x35, receive=True) & 2
        # Program data and read it through the IDF QIO transaction shape.
        spi(0x06)
        for offset,value in ((0x1c,0xc8000000),(0x20,23<<26),(0x24,(7<<28)|2),
                             (0x04,0x900000),(0x28,31),(0x80,0x76543210),(0,1<<18)):
            command(f'writel {0x3ff42000+offset:#x} {value:#x}')
        for offset,value in ((0x1c,0xf0000020),(0x20,(27<<26)|6),(0x24,(7<<28)|0xeb),
                             (0x04,0x9000ff),(0x2c,31),(0x80,0xffffffff),(0,1<<18)):
            command(f'writel {0x3ff42000+offset:#x} {value:#x}')
        assert int(command('readl 0x3ff42080').split()[1],16)==0x76543210, 'QIO dummy cycles leaked into flash data'
        # Two simultaneous channels, independent memory and interrupts.
        for channel in (0, 1):
            write(0x20 + channel*8, (1 << 24) | 8)
            write(0xd0 + channel*4, 1)
            write(0x800 + channel*256, (7 << 16) | 0x8003)
            write(0x804 + channel*256, 0)
        write(0xa8, (1 << 24) | (1 << 25) | 1 | 8)
        write(0x24, (1 << 17) | 9)
        write(0x2c, (1 << 17) | 9)
        command('clock_step 999')
        assert read(0xa0) == 0, 'IRQ arrived before the pulse duration elapsed'
        command('clock_step 1')
        expected = (1 << 24) | (1 << 25) | 1 | 8
        assert read(0xa0) & expected == expected
        assert read(0xa4) & expected == expected
        assert read(0x24) & 1 == 0
        write(0xac, expected)
        assert read(0xa4) == 0
        write(0xa8, 0)
        # A zero-length memory allocation raises a channel error, not a crash.
        write(0x30, 8)
        write(0x34, (1 << 17) | 9)
        command('clock_step 10000')
        assert read(0xa0) & (1 << 8)
        assert read(0xa4) == 0
        # Refill interrupt allows the CPU to replace the consumed half-buffer.
        write(0xac, 0xffffffff)
        write(0xf0, 2)
        write(0xd0, 32)
        for i in range(64):
            write(0x800 + i*4, (7 << 16) | 0x8003)
        write(0xa8, (1 << 24) | 1)
        write(0x24, (1 << 17) | 9)
        command('clock_step 32000')
        assert read(0xa4) == 1 << 24
        write(0x800, 0)
        write(0xac, 1 << 24)
        command('clock_step 32000')
        assert read(0xa4) & 1
        # Actual GPIO matrix routing and GRB-to-RGB decoding, including reset pulse.
        command('writel 0x3ff44544 87')  # GPIO5 <- RMT0
        command('writel 0x3ff44574 88')  # GPIO17 <- RMT1
        for channel, grb in ((0, bytes.fromhex('341256')), (1, bytes.fromhex('cdabef'))):
            write(0x20 + channel*8, (1 << 24) | 8)
            for bit in range(24):
                one = (grb[bit//8] >> (7-bit%8)) & 1
                write(0x800 + channel*256 + bit*4, ((3 if one else 10) << 16) | 0x8000 | (8 if one else 2))
            write(0x800 + channel*256 + 24*4, (1400 << 16) | 1400)
            write(0x800 + channel*256 + 25*4, 0)
            write(0x24 + channel*8, (1 << 17) | 9)
        command('clock_step 400000')
        capture = telemetry.read_text()
        (ROOT / 'verification/rmt-qtest.jsonl').write_text(capture)
        records = [json.loads(line) for line in capture.splitlines()]
        print('Telemetry:', len(records), 'events;', {r['channel'] for r in records if r['event'] == 'symbol'})
        assert {r['channel'] for r in records if r['event'] == 'symbol'} == {0, 1}
        assert sum(r['event'] == 'end' for r in records) == 5
        pixels = [r for r in records if r['event'] == 'leds']
        assert {(r['pin'],r['pixels']) for r in pixels} == {(5,'123456'),(17,'abcdef')}, pixels
        if os.environ.get('ARENA_TEST_PACING'):
            # Consume a full ring without a refill: stale symbols must not replay.
            write(0xac, 0xffffffff)
            write(0xd0, 32)
            for i in range(64):
                write(0x800 + i*4, (7 << 16) | 0x8003)
            write(0x24, (1 << 17) | 9)
            command('clock_step 64000')
            before = telemetry.read_text().count('"event":"symbol"')
            command('clock_step 1000000')
            assert telemetry.read_text().count('"event":"symbol"') == before, 'stale RAM replayed'
            assert read(0x24) & 1, 'channel stopped while waiting for refill'
            write(0x800, 0)
            command('clock_step 100000')
            assert not read(0x24) & 1, 'refill did not resume and finish'
            print('PASS: host-paced RMT waits for fresh RAM without replaying stale pixels')
        print('PASS: radio banks/aliases, RNG visibility, timed IQ capture/cancellation, association rejection, flash ID/QE/write protection, Wi-Fi clock, RMT channels/telemetry/IRQs/refill')
    finally:
        watchdog.cancel()
        process.terminate()
        process.wait(timeout=10)
