# Third-party notices

The custom emulator patch targets [Espressif QEMU](https://github.com/espressif/qemu), commit `40edccac415693c5130f91c01d84176ae6008566`. QEMU is principally GPL version 2; individual files retain their upstream licenses. New peripheral files carry their SPDX notices. See `LICENSES/QEMU-GPL-2.0.txt` and the upstream source for complete notices. The patch includes modified upstream code and is not a proprietary replacement for QEMU. Any binary distribution needs its corresponding source, build instructions, and applicable notices.

[ArenaTimer](https://github.com/WannaBAcoder/ArenaTimer) supplies the firmware users build/upload separately. No firmware binary or generated firmware page is included. The optional behavioral adapter requires a separate source checkout. The inspected checkout contains third-party library licenses but no top-level license covering ArenaTimer itself; do not assume those library licenses license ArenaTimer. Confirm permission before redistributing its code or generated artifacts.

The original dashboard, server, adapters, scripts, and tests are licensed under GPL-2.0-or-later; see LICENSE and the license grant in README.md. Existing third-party code, patch context, and upstream modifications retain their applicable licenses. This grant does not override upstream licenses or grant rights to separately supplied ArenaTimer firmware.
