# Build and run the custom emulator

Windows prerequisites: Node.js 22+, Git, and MSYS2 installed at `C:\msys64` (or set `ARENA_MSYS_BIN` to its UCRT64 bin directory).

In the MSYS2 UCRT64 terminal, install build dependencies:

```sh
pacman -S --needed git make mingw-w64-ucrt-x86_64-toolchain mingw-w64-ucrt-x86_64-python mingw-w64-ucrt-x86_64-ninja mingw-w64-ucrt-x86_64-meson mingw-w64-ucrt-x86_64-pkgconf mingw-w64-ucrt-x86_64-glib2 mingw-w64-ucrt-x86_64-pixman mingw-w64-ucrt-x86_64-libslirp mingw-w64-ucrt-x86_64-libgcrypt
bash qemu/build-custom.sh
```

Run the script from the repository root. It clones the pinned Espressif source, applies the included patch, builds QEMU, and installs its executable and ESP32 ROM files into ignored `.tools/` directories. Defaults are `/c/arena-qemu-source` and `/c/arena-qemu-build`; override `ARENA_QEMU_SOURCE` and `ARENA_QEMU_BUILD` with unused paths without spaces. Existing modified source is never reset. The revised setup has not yet been verified on a fresh PC.

Run `start.cmd`, upload a complete 4 MB flash image, then power on. The repository does not provide any application firmware. Later application-only uploads retain the current image's bootloader, partition table and non-application regions. Header checks cannot guarantee the uploaded firmware will run.

`runtime/flash.bin` stores firmware and all guest credentials. `runtime/serial.log` records UART diagnostics. Both are ignored. Keep flash backups private as well. Public virtual-network defaults are `ArenaTimer-Virtual` / `ArenaTimer123`; they are unrelated to the host's network password.

The optional `build.cmd` and `platformio.ini` build firmware from a separate adjacent ArenaTimer source checkout using locally installed toolchains. They are not a prerequisite for running the dashboard. Their outputs are ignored.

See [the main README](../README.md) for limitations and [historical development notes](CUSTOM_QEMU.md) for earlier experiments. Historical captures are deliberately excluded from publication.
