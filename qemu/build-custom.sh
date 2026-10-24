#!/usr/bin/env bash
set -euo pipefail
export PATH=/ucrt64/bin:/usr/bin:$PATH
repo="$(cd "$(dirname "$0")/.." && pwd)"
source_dir="${ARENA_QEMU_SOURCE:-/c/arena-qemu-source}"
build_dir="${ARENA_QEMU_BUILD:-/c/arena-qemu-build}"
revision=40edccac415693c5130f91c01d84176ae6008566
[[ "$source_dir$build_dir" != *" "* ]] || { echo 'Choose source/build paths without spaces'; exit 1; }
if [[ ! -e "$source_dir" ]]; then
 git clone https://github.com/espressif/qemu.git "$source_dir"
 git -C "$source_dir" checkout --detach "$revision"
fi
[[ "$(git -C "$source_dir" rev-parse HEAD)" == "$revision" ]] || { echo 'Source revision differs; choose a new source directory'; exit 1; }
patch="$repo/qemu/patches/arena-hardware.patch"
if git -C "$source_dir" apply --reverse --check "$patch" 2>/dev/null; then
 echo 'Patch already present'
else
 [[ -z "$(git -C "$source_dir" status --porcelain)" ]] || { echo 'Source has local changes; choose a new source directory'; exit 1; }
 git -C "$source_dir" apply --check "$patch"
 git -C "$source_dir" apply "$patch"
fi
mkdir -p "$build_dir"
cd "$build_dir"
"$source_dir/configure" --target-list=xtensa-softmmu --disable-werror --disable-docs --disable-gtk --disable-sdl --disable-tools --disable-guest-agent --enable-slirp --enable-gcrypt
python3 - <<'PY'
from pathlib import Path
p=Path('build.ninja')
p.write_text(p.read_text().replace('csrDT', 'csrD'))
for p in Path('.').glob('*.a'):
    if p.read_bytes()[:8] == b'!<thin>\n':
        p.replace(p.with_suffix('.thin-backup'))
PY
ninja -j"${ARENA_BUILD_JOBS:-4}" qemu-system-xtensa.exe
mkdir -p "$repo/.tools/qemu-custom/bin" "$repo/.tools/qemu/qemu/share/qemu"
cp qemu-system-xtensa.exe "$repo/.tools/qemu-custom/bin/"
cp "$source_dir"/pc-bios/esp32*.bin "$repo/.tools/qemu/qemu/share/qemu/"
echo 'Custom emulator installed. Run start.cmd from Windows.'
