"""Launch the packaged webview; the frontend acknowledges readiness and exits."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile


def one(directory, pattern):
    [match] = directory.glob(pattern)
    return match


def run(*args, **kwargs):
    subprocess.run(args, timeout=120, check=True, **kwargs)


def main():
    bundle = Path("src-tauri/target/release/bundle").resolve()
    with tempfile.TemporaryDirectory() as directory:
        target = Path(directory)
        if sys.platform == "win32":
            installer = one(bundle, "nsis/*-setup.exe")
            run(installer, "/S", f"/D={target}")
            run(one(target, "sc-commander.exe"), "--smoke-test")
        elif sys.platform == "darwin":
            mount = target / "volume"
            run("hdiutil", "attach", one(bundle, "dmg/*.dmg"), "-nobrowse",
                "-readonly", "-mountpoint", mount)
            try:
                run(one(mount, "*.app/Contents/MacOS/sc-commander"), "--smoke-test")
            finally:
                run("hdiutil", "detach", mount)
        else:
            app = one(bundle, "appimage/*.AppImage")
            run("xvfb-run", "-a", app, "--appimage-extract-and-run", "--smoke-test",
                env={**os.environ, "WEBKIT_DISABLE_DMABUF_RENDERER": "1"})


if __name__ == "__main__":
    main()
