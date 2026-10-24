# ArenaTimer ESP32 emulator

An experimental Windows dashboard for a modified Espressif QEMU ESP32 emulator. Users supply their own firmware. No firmware, API keys, saved device settings, or emulator executables are distributed.

## Start

1. Install Node.js 22 or newer and Git.
2. Build the custom emulator using [the setup instructions](qemu/README.md).
3. Run `start.cmd` (or `npm start`). Open http://localhost:8757/emulator.
4. Upload a **complete 4 MB ESP32 flash image** containing its bootloader at `0x1000`, partition table at `0x8000`, and application. Power on after upload. An application-only `.bin` cannot initialize empty flash; subsequent application updates use the first application partition in the existing image.
5. Use the guest firmware interface on port 8758 to configure Wi-Fi and RCE Manager.

The virtual router credentials shown in the dashboard are public emulator defaults, not the PC's real Wi-Fi credentials. The guest uses the host's internet connection through NAT.

The server binds to `0.0.0.0`. Other LAN devices use `http://<PC-IP>:8757/emulator`; port 8758 serves the guest interface. These control interfaces have no dashboard authentication. Use a trusted LAN; do not forward these ports to the internet. `allow-network.cmd` optionally opens the Windows firewall for the local subnet.

## What the display means

The default synchronized clock mirrors the value displayed by the embedded firmware web page. It is a presentation view, not a measurement of LED timing. The selectable raw RMT view uses firmware-generated LED data, grouped into seven segments per digit and four border sections. Buttons send commands to the guest's UART handler.

Wi-Fi and RMT are experimental. Cache-error startup crashes and intermittent RCE reconnects have been observed. RMT refill pacing stretches pulse timing to accommodate host scheduling; this is not cycle-accurate emulation. ESP-NOW, LoRa hardware, RMT receive/carrier, full GPIO fidelity, and OTA are not fully verified/supported. See [implementation history](qemu/CUSTOM_QEMU.md).

## Private local files

- `qemu/runtime/flash.bin` and backups contain the guest firmware, NVS, RCE API key, and saved Wi-Fi settings.
- `qemu/runtime/`, `qemu/verification/`, logs, `state.json`, and `public/uart-clear.json` are private/generated and ignored.
- `.tools/`, `build/`, `.pio/`, firmware binaries, and debug ELF files are ignored.

Do not upload those files as release attachments or issue diagnostics. Git ignore rules do not remove previously tracked files. Run `npm run audit` before staging; review staged files again before publishing.

## Optional behavioral simulator

The `/` dashboard is a separate native simulation, not ESP32 binary emulation. To use it, supply an adjacent `../ArenaTimer/Software/main` source checkout and a C++17 compiler, then run `npm run build`. The default compiler is MSYS2 UCRT64 `g++`; set `CXX` to override it. It is not built automatically and is unnecessary for `/emulator`.

## Tests

`npm run test:dashboard` runs dependency-free display/relay tests. `npm test` additionally requires the optional native build. `python qemu/test-custom.py <qemu-executable>` exercises the custom hardware model. Live guest diagnostic scripts require your own firmware and may change timer settings; read them before use.

## License

The original code in this project is licensed under the GNU General Public License, version 2 or (at your option) any later version (SPDX: `GPL-2.0-or-later`). You may redistribute and modify it under those terms. It is provided without any warranty, including the implied warranties of merchantability or fitness for a particular purpose. See [LICENSE](LICENSE) for the full license text.

Third-party code and modifications to upstream files retain their applicable licenses and notices; this project license does not relicense them. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Release status

See [third-party notices](THIRD_PARTY_NOTICES.md) for upstream attribution and firmware licensing limitations. A fresh-machine build remains to be verified before calling installation fully tested.
