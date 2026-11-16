"""Configure Tauri's release build and assemble its static update manifest."""
import argparse
from base64 import b64decode
import json
import os
from pathlib import Path
import re
import shutil
from urllib.parse import quote


def updater_key():
    key = os.environ.get("TAURI_UPDATER_PUBLIC_KEY", "").strip()
    if not key:
        raise SystemExit("Set the TAURI_UPDATER_PUBLIC_KEY repository variable before tagging a release")
    return key


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def configure(path, repository, key):
    write_json(path, {
        "bundle": {"createUpdaterArtifacts": True},
        "plugins": {
            "updater": {
                "pubkey": key,
                "requireSignedVersion": True,
                "endpoints": [f"{repository}/releases/latest/download/latest.json"],
            },
        },
    })


def find_asset(directory, pattern):
    matches = list(directory.rglob(pattern))
    if len(matches) != 1 or not matches[0].is_file() or matches[0].stat().st_size == 0:
        raise SystemExit(f"Expected exactly one nonempty release asset matching {pattern}")
    return matches[0]


def key_id(value, name, expected_size):
    # Tauri wraps the Minisign text in Base64. The second line contains the
    # algorithm, then the eight-byte key ID, then the key or signature bytes.
    try:
        packet = b64decode(b64decode(value, validate=True).splitlines()[1], validate=True)
    except (ValueError, IndexError):
        raise SystemExit(f"Invalid Tauri updater key or signature in {name}") from None
    if len(packet) != expected_size:
        raise SystemExit(f"Invalid Tauri updater packet size in {name}")
    return packet[2:10]


def stage(source, repository, key, version, tag):
    destination = source.with_name("release-assets")
    destination.mkdir()
    public_key_id = key_id(key, "TAURI_UPDATER_PUBLIC_KEY", 42)
    assets = set()

    def copy_asset(asset):
        # GitHub rewrites names containing spaces and special characters.
        name = re.sub(r"[^a-zA-Z0-9._-]", ".", asset.name)
        if name in assets:
            raise SystemExit(f"Duplicate release asset name: {name}")
        shutil.copyfile(asset, destination / name)
        assets.add(name)
        return name

    copy_asset(find_asset(source, "*_aarch64.dmg"))
    platforms = {}
    for target, pattern in {
        "windows-x86_64": "*_x64-setup.exe",
        "linux-x86_64": "*_amd64.AppImage",
        "darwin-aarch64": "*.app.tar.gz",
    }.items():
        payload = find_asset(source, pattern)
        signature_file = find_asset(source, payload.name + ".sig")
        signature = signature_file.read_text(encoding="utf-8").strip()
        if key_id(signature, signature_file.name, 74) != public_key_id:
            raise SystemExit(f"Updater signing key does not match the public key for {target}")
        name = copy_asset(payload)
        copy_asset(signature_file)
        platforms[target] = {
            "signature": signature,
            "url": f"{repository}/releases/download/{quote(tag, safe='')}/{quote(name)}",
        }
    write_json(destination / "latest.json", {"version": version, "platforms": platforms})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["config", "stage"])
    parser.add_argument("path", type=Path)
    args = parser.parse_args()

    repository = "https://github.com/" + os.environ["GITHUB_REPOSITORY"]
    version = json.loads(Path("src-tauri/tauri.conf.json").read_text(encoding="utf-8"))["version"]
    tag = os.environ["GITHUB_REF_NAME"]
    if not re.fullmatch(r"(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*)){2}", version):
        raise SystemExit("Signed releases require a stable major.minor.patch version")
    if tag != f"v{version}":
        raise SystemExit(f"Release tag must match the Tauri version (expected v{version})")

    key = updater_key()
    if args.operation == "config":
        configure(args.path, repository, key)
    else:
        stage(args.path, repository, key, version, tag)


if __name__ == "__main__":
    main()
