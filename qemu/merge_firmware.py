Import("env")
import os
import shutil
import subprocess

def merge_firmware(source, target, env):
    build_dir = env.subst("$BUILD_DIR")
    esptool = os.path.join(env.PioPlatform().get_package_dir("tool-esptoolpy"), "esptool.py")
    images = [(str(offset), env.subst(image)) for offset, image in env.get("FLASH_EXTRA_IMAGES", [])]
    images.append((env.subst("$ESP32_APP_OFFSET"), str(target[0])))
    merged = os.path.join(build_dir, "firmware.merged.bin")
    command = [env.subst("$PYTHONEXE"), esptool, "--chip", "esp32", "merge_bin", "-o", merged, "--flash_mode", "dio", "--flash_size", "4MB", "--fill-flash-size", "4MB"]
    for offset, image in images:
        command.extend([offset, image])
    subprocess.run(command, check=True)
    destination = os.path.join(env.subst("$PROJECT_DIR"), "firmware")
    os.makedirs(destination, exist_ok=True)
    name = env.subst("$PIOENV")
    shutil.copy2(str(target[0]), os.path.join(destination, name + ".bin"))
    if name == "esp32da":
        shutil.copy2(merged, os.path.join(destination, "boot.merged.bin"))
        shutil.copy2(os.path.join(build_dir, "firmware.elf"), os.path.join(destination, "boot.elf"))

env.AddPostAction("$BUILD_DIR/${PROGNAME}.bin", merge_firmware)
