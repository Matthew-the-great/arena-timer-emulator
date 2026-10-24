> Historical development log: entries below describe different stages and may contradict later fixes. For current behavior and setup, use the main README. Local captures are not distributed.

# Custom ESP32 emulator: tested progress and remaining work

Status as of October 22, 2026: **partial implementation, not a complete virtual ArenaTimer**. The existing dashboard remains at `/`; `/emulator` now launches the locally built QEMU executable. ArenaTimer's source and application binary have not been patched.

## What is implemented and tested

| Component | Evidence and limits |
| --- | --- |
| GigaDevice flash | Corrected GD25Q status-register handling for quad-enable read/write. Actual SPI MMIO tests cover JEDEC ID, WRSR/WRSR2, readback and write protection. The unchanged firmware gets past its original flash initialization assertion. |
| RMT transmit | New experimental model with eight independent channel states, pulse-duration scheduling, memory wrap, refill/completion interrupts, interrupt masking/clearing, and optional raw-symbol telemetry. Tests exercise two simultaneous channels, timed completion, circular-buffer refill and invalid allocation. RX, carrier, continuous mode, migration and full reset/clock fidelity are not implemented. |
| Wi-Fi clock register | DPORT_WIFI_CLK_EN read/write storage with the documented reset value. Register tests pass. This does not implement the Wi-Fi radio. |
| Dashboard | Custom executable selection, explicit ROM directory, deterministic instruction-count scheduling, and QMP reset/pause/resume verified. The original native simulator's five tests still pass. |

The RMT tests are peripheral-level tests, **not evidence that ArenaTimer's LEDs run end to end**. Firmware initialization calls Wi-Fi before its first LED frame. GPIO/IOMUX routing and WS2812 decoding still need to be connected to the dashboard; its real-emulator clock remains explicitly unavailable.

## Current experimental Wi-Fi result

**Installed and running:** the user?s unchanged uploaded firmware serves its actual web page, status endpoint and WebSocket updates through emulated Wi-Fi.

- Dashboard: `http://<PC-IP>:8757/emulator`
- Actual guest firmware web interface: `http://<PC-IP>:8758/` (or `http://localhost:8758/` on this PC).
- The native behavioral simulator remains at port 8757 `/`.

Tested application SHA256: `5d87d4a169695597ce993a07e2bb2818eefd3b20696165b9cba3c5d5cac10c26`.

Verification: AP startup, successful WPA2 association, authenticated four-way handshake, DHCP ACK, HTTP **200 / 44887 bytes**, `/status` JSON, and a valid WebSocket upgrade. Through the installed LAN relay, changing virtual time generated a `00:59` WebSocket update; it was restored to `02:00`. Hardware reset reconnected successfully. A wrong-password run associated but failed key negotiation and could not access HTTP. The five existing native simulator tests and QEMU hardware tests pass.

The virtual station now advertises an RSN element for CCMP/PSK and derives PMK/PTK with PBKDF2-HMAC-SHA1 and the WPA PRF. It sends messages 2/4, checks message 3's nonce, replay counter, MIC and AES-wrapped key-data integrity. DHCP is sent only after that step; the station reports connected only after an ACK. Imported packet code also had an expired SSID pointer, uninitialized frame fields, missing BOOTP opcode, hard-coded AP address overwrite and extra Ethernet payload bytes; these were corrected. Receive descriptors are checked for ownership and capacity. Hardware reset clears queued frames and key state.

**Limits:** this is one tested WPA2-PSK/CCMP station connecting to the guest AP. WPA3, roaming, rekeying, arbitrary AP configurations and complete radio fidelity are not implemented. Bulk packets are represented at the ESP32 hardware-decrypted DMA boundary with CCMP header/MIC space, rather than transmitted across an encrypted RF channel. The handshake uses real password-derived cryptography, but this is not an implementation or validation of complete CCMP radio encryption. Group key material is unwrapped for integrity verification, not used for over-the-air encryption. Analog calibration remains the explicit approximation described below. ESP-NOW and ElegantOTA uploads are not verified. GPIO-to-LED routing is now covered by the checks below.

### Dashboard networking

QEMU forwards guest HTTP and WebSocket ports only to loopback ports 18760/18761. `network.mjs` relays them on `0.0.0.0:8758`; it does not answer firmware APIs itself. For LAN browser compatibility it replaces only the HTML's hard-coded WebSocket URL (`hostname:81`) with the relay's `/ws` URL. The application binary remains unchanged.

`runtime/efuse.bin` persists the virtual factory MAC separately from application flash. The default virtual station password matches ArenaTimer's default `12345678`; set `ARENA_AP_PASSWORD` before launching the server if the guest AP uses another password. The supplied build uses AP address `192.168.4.1`. Changing the guest's AP/network configuration can disconnect this relay. Use the upload panel to program virtual flash; OTA is not yet tested. Port 8758 displays a 503 while powered off and may display a temporary 502 during startup; use **Reload firmware panel** after startup.

`allow-network.cmd` covers ports 8757 and 8758 for the local subnet if Windows Firewall needs a rule. The prior executable is retained as `.tools/qemu-custom/bin/qemu-system-xtensa-before-wifi.exe`.

### Changes in the experimental build

- Independent RF/AGC, FE/FE2, baseband, shared-modem, PHY and WDEV register-storage banks with APB aliases and reset clearing. Storage is scaffolding, not a verified specification of all register access semantics/reset values.
- The implemented RNG register at WDEV+0x144 overlays the WDEV storage bank. A regression test verifies both RNG aliases remain live.
- Opt-in **IQ capture model**, inferred from disassembly of the supplied binary and the matching `ram_iq_est_enable` function in Espressif's `libphy.a`. FE+0x7c uses enable bit 0, start bit 1, sample-count bits 2..16 and completion bit 31. A virtual-clock timer completes the operation; stopping cancels it; firmware cannot write the completion bit. The model uses **ideal zero-input samples and an assumed 1 microsecond sample period**. It does not reproduce analog RF calibration or validated silicon timing. This is a deliberate experimental approximation, disabled by default, not evidence of complete ESP32 fidelity. The reference fork's unconditional `0xffffffff` completion shortcut was not copied.
- A disposable virtual eFuse can supply a valid MAC and CRC. With no eFuse image the MAC was all zero; supplying one enables real management-frame transmissions. No physical eFuses are accessed.
- Fixed imported station code that kept the SSID in expired stack memory. The SSID now lives in the device state and copy lengths are bounded.
- Rejected association responses no longer trigger DHCP. The failure status is logged rather than treated as a successful association.
- Optional bounded MAC register/frame trace and a loopback-only HTTP probe. Network tests use restricted QEMU user networking; no LAN listener is created.

qtest covers register-bank independence/aliases, RNG visibility, timed capture completion/cancellation/read-only status, and a rejected association response passed through the actual MAC TX DMA path. Existing flash and RMT tests still pass. See `verification/iq-capture-disassembly.txt`, `verification/wpa-pass-boot.txt`, `verification/wpa-pass-boot-registers.json`, `verification/wpa-pass-wifi-mmio.log`, and `verification/wpa-wrong-password-wifi-mmio.log`.

The MAC/AP model remains experimental. Broader protocol, malformed-frame and reset coverage is still needed; the tests above cover the supplied firmware and default AP configuration. RMT RX/carrier, actual ESP-NOW and ElegantOTA remain unverified/unavailable.

## Source and reproducibility

- Base: Espressif QEMU tag `esp-develop-9.2.2-20260417`, commit `40edccac415693c5130f91c01d84176ae6008566`.
- Local source: `../.tools/qemu-source`. All current changes, including the experimental Wi-Fi port, are saved in `patches/arena-hardware.patch`.
- Experimental Wi-Fi/analog/PHY source: [Ebiroll/calib](https://github.com/Ebiroll/calib), commit `73bee9bab5a78b0aaa584610b1564d533e7879ce`. Original notices are preserved. This is an experimental port, not a claim of compatibility with ArenaTimer.
- Local build directory: `%LOCALAPPDATA%/arena-qemu-build`. The source junction `%LOCALAPPDATA%/arena-qemu-source` avoids spaces rejected by QEMU's configure script.
- Installed executable: `../.tools/qemu-custom/bin/qemu-system-xtensa.exe`. The original Espressif executable remains installed separately. The custom build uses the existing MSYS2 UCRT runtime libraries and official ROM files.

Run `C:\msys64\usr\bin\bash.exe qemu/build-custom.sh` from the simulator directory to rebuild. Dependencies installed in MSYS2 include the UCRT GCC toolchain, Python, Meson, Ninja, pkgconf, glib2, pixman, libgcrypt, libslirp, make and diffutils. The patch includes Windows trace-path fixes, an optional symlink-bundle workaround, and consistent dynamic libslirp linkage. The build script uses ordinary archives to avoid the observed Windows thin-archive failure.

For a fresh checkout, apply `arena-hardware.patch` to the pinned Espressif source before running the build script. After a successful build and tests, copy the executable from the build directory into `.tools/qemu-custom/bin` while QEMU is stopped, then restart the dashboard server. Building does not automatically replace the running executable.

## Verification commands

From `ArenaTimerSimulator`:

```powershell
python qemu/test-custom.py
python qemu/check-boot.py
npm test
```

`test-custom.py` drives real QEMU through qtest with disposable flash. The following command reproduces the supplied firmware experiment (HTTP, status and WebSocket checks should pass):

```powershell
.tools\pio\Scripts\python.exe qemu/check-boot.py --app <path-to-user-firmware.bin> --experimental-capture --virtual-mac 02:00:00:87:57:00 --station-password 12345678 --trace-wifi --http-probe --seconds 25 --label wpa-pass
```

`check-boot.py` verifies that the stock flash image is unchanged and never opens the persistent dashboard flash. It exits 1 on guest panic, 2 if no AP startup marker is observed, and 3 if any requested HTTP/status/WebSocket probe fails. An AP marker alone is not a network pass. At the deadline it saves both CPUs' registers over loopback-only QMP. Wi-Fi trace output is limited to 10000 events. The firmware application remains unchanged inside a temporary stock flash image.

Deterministic execution uses `-accel tcg,thread=single -icount shift=3`. This controls emulator scheduling; it is not a guarantee of cycle-accurate timing or real-time speed. Earlier non-deterministic boot trials also produced cache errors, so broader CPU/cache/timing compatibility remains unverified.


## Dashboard LED output and controls (2026-10-23)

The custom RMT transmitter now decodes WS2812 GRB symbols into RGB frames.
GPIO matrix output selections route RMT channels to GPIO5 (digit strip) and
GPIO17 (border strip). Low reset pulses latch frames. The dashboard consumes
these actual output frames over a loopback socket and renders both display sides;
it does not generate LED colors from timer status. The supplied firmware emits
342 pixels per strip. Brightness is already encoded in the transmitted pixels.

The dashboard's Firmware controls send the firmware's existing UART hotkeys
(s/p/x/t/r/b) into the emulated UART0. The guest runs its own checkButtons()
and processCommand() logic, including ready lockout and tap-out behavior. These are not simulated ESP-NOW remotes
or physical GPIO button presses. EN/RESET still resets the emulated hardware.
GPIO input, full IOMUX/electrical behavior, and radio remotes remain incomplete.

Validation: `qemu/test-custom.py` covers simultaneous RMT channels, refill IRQs,
GPIO routing, GRB conversion and reset pulse latching. Live validation (`qemu/verify-led-controls.py`, with server and guest running) uses UART command logs and actual RMT frame changes; it exercises and resets a match. The HTTP
color test uncovered intermittent guest-network failures after AP reinitialization;
that remains a limitation of the Wi-Fi model. UART controls remain available.

The dashboard now defaults to wall-clock scheduling (`-accel tcg,thread=multi`, without `-icount`). Fixed instruction timing previously let the clock fall behind real time. `ARENA_CLOCK=fixed` retains the previous diagnostic mode; `auto` is experimental and caused watchdog resets in testing.

RMT batches symbols up to refill/end boundaries. In dashboard real-time mode, the opt-in `refill-pacing` property waits for fresh RAM writes instead of replaying stale half-buffers when host scheduling delays the guest ISR. This preserves firmware-produced pixel data but stretches LED pulse timing: it is not cycle-accurate hardware underflow behavior. The property defaults off in QEMU and in register tests. The dashboard rejects truncated/overrun frames (expected 171 or 342 complete pixels per output), preserving the last valid frame and all legitimate colors, including green. Telemetry includes virtual timestamps and bit counts for diagnosis. Firmware remains unchanged.

Validation: `python qemu/check-clock.py` samples live LED timestamps for 45 seconds. An idle display may not redraw; use `--refresh` to request redraws in the current digit color without starting a match. `ARENA_TEST_PACING=1` enables the additional stale-refill regression in `qemu/test-custom.py`. Node tests cover malformed-frame rejection and acceptance of valid green pixels.


## Virtual router and persistent Wi-Fi settings (2026-10-23)

The dashboard now shows SSID `ArenaTimer-Virtual`, password `ArenaTimer123`.
Enter these in the unchanged guest firmware's Wi-Fi settings. The virtual router
performs WPA2-PSK authentication (password-derived PTK and verified key MICs) and
passes Ethernet traffic to QEMU user networking. DHCP assigns `192.168.4.3`,
gateway `192.168.4.2`, DNS `192.168.4.254`. NAT uses the host's existing network;
no Windows Wi-Fi adapter or hotspot is created. Outbound access is enabled
(`restrict=off`). This is a single guest/router model, not full RF emulation.

The guest interface remains on LAN port 8758. Its relay switches from the setup
hotspot forwarding ports to the station forwarding ports when the firmware
reports a successful connection. The embedded panel reloads on that transition.
The UART controls and RMT display do not depend on this connection.

Two SPI bugs caused failed persistence: RX indexed its limit using transmitted
byte contents, and QIO reads omitted the m25p80 dummy phase, returning shifted
settings data. Both are fixed in the controller model; firmware is unchanged.
The original flash was restored after a diagnostic fresh-NVS test, then the
virtual SSID/password were saved through the actual firmware form. Backups:
`runtime/flash-before-router.bin` and `runtime/flash-before-nvs-test.bin`.
The installed SPI dummy adapter is validated with the GD25Q32 used by this board;
it is not a general validation of every flash vendor's read mode.

Additional MAC fixes resume RX after the driver appends DMA descriptors and
match the BSSID against the correct address for ToDS/FromDS frames. The router
unicasts downstream multicast/broadcast traffic to its sole station using the
pairwise key layout. GTK is negotiated but multi-station group delivery, rekey,
WPA3, roaming and complete RF timing remain unsupported. Guest AP fallback is
handled by returning to the existing virtual-client setup connection.

Verified: saved credentials survive a cold QEMU restart, WPA2 handshake completes,
DHCP assigns 192.168.4.3, guest `/status` responds through port 8758, DNS replies
return from the virtual DNS forwarder, and an external NTP reply arrives from
198.178.138.197:123. Evidence: `verification/router-status.json` and
`verification/router-success-trace.log`. This verifies DNS/UDP internet traffic;
it does not establish compatibility with every TLS service or ElegantOTA.
Run `qemu/verify-router.py` with the configured emulator running to check login,
DHCP and HTTP. `qemu/test-custom.py` also tests the SPI RX indexing and QIO read
regressions. Optional `ARENA_TRACE_WIFI=1` saves bounded trace output to
`runtime/wifi-trace.log`.

Combined network/display validation: `qemu/verify-router-leds.py` changes the guest digit color through its actual HTTP endpoint, observes new RMT pixel output, and restores the original color. Evidence is `verification/router-leds.json`. Complete WS2812 pixels latch even when a trailing pixel is incomplete.
