"""Exercise the OS webview against disposable native files on each desktop target."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

binary = Path("src-tauri/target/debug/sc-commander" + (".exe" if os.name == "nt" else "")).resolve()
count = int(os.environ.get("SC_UI_ENTRIES", "100000"))
with tempfile.TemporaryDirectory(prefix="sc-ui-") as folder:
    root = Path(folder).resolve()
    (root / ".sc-ui-fixture").touch()
    for name in ["source", "target", "large"]:
        (root / name).mkdir()
    (root / "source" / "nested").mkdir()
    (root / "source" / "alpha.txt").write_bytes(b"alpha")
    (root / "source" / "beta.txt").write_bytes(b"beta")
    for name in [".dot-file", ".dot-folder", "native-hidden-file", "native-hidden-folder"]:
        path = root / "source" / name
        if name.endswith("folder"):
            path.mkdir()
        else:
            path.write_bytes(b"hidden")
        if name.startswith("native-hidden"):
            if os.name == "nt":
                import ctypes
                assert ctypes.windll.kernel32.SetFileAttributesW(str(path), 2)
            else:
                path.rename(path.with_name("." + name))
    for i in range(count):
        (root / "large" / str(i)).touch()
    env = {**os.environ, "SC_UI_FIXTURE": str(root), "SC_UI_ENTRIES": str(count)}
    command = [str(binary), "--ui-test"]
    if sys.platform == "linux":
        command = ["xvfb-run", "-a", *command]
        env["WEBKIT_DISABLE_DMABUF_RENDERER"] = "1"
    result = subprocess.run(command, env=env, timeout=240, cwd=root)
    report = root / "result.json"
    if not report.exists():
        raise RuntimeError(f"App exited with {result.returncode} before reporting its test result")
    result_data = json.loads(report.read_text(encoding="utf-8"))
    print(json.dumps(result_data, indent=2), flush=True)
    result.check_returncode()
    assert result_data["ok"]
    assert (root / "target" / "alpha.txt").read_bytes() == b"alpha"
    assert (root / "source" / "alpha.txt").read_bytes() == b"alpha"
    assert (root / "target" / "beta.txt").read_bytes() == b"beta"
    assert not (root / "source" / "beta.txt").exists()
    assert not (root / "target" / "renamed.txt").exists()
    assert (root / "target" / "created").is_dir()
