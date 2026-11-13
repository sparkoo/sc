# SC

SC is a keyboard-first, two-pane desktop file commander for Windows, Linux, and macOS. Its first release focuses on browsing and safely transferring local files.

- [Requirements and acceptance criteria](docs/requirements.md)
- [Architecture and extension points](docs/architecture.md)
- [Contributor and agent instructions](AGENTS.md)

## Run locally

Install Node.js 22.12 or newer, stable Rust, and the [Tauri desktop prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS. From the repository root:

```sh
npm ci
npm run tauri -- dev
```

Use `npm run tauri -- build` to produce a local installer.

## Releases

Download the latest Windows x64 installer (`.exe`), macOS Apple Silicon disk image (`.dmg`), or Ubuntu 24.04 x64 AppImage from [GitHub Releases](https://github.com/sparkoo/sc/releases). Builds are currently unsigned; Windows SmartScreen and macOS Gatekeeper may require manual approval for builds you trust.

To publish a release, update the version consistently in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`, merge the changes to `master`, then create and push a matching version tag (for example, `v0.1.0`). The [Release workflow](https://github.com/sparkoo/sc/actions/workflows/release.yml) builds and smoke-tests all three platforms before publishing the installers and generated release notes. A failed build prevents publication.

## Tester builds

Choose **Tester builds** in [GitHub Actions](https://github.com/sparkoo/sc/actions/workflows/test-builds.yml), run it on `master`, then download the artifact for your platform from the run summary. Each download identifies its exact commit and stays available for 30 days. A signed-in GitHub account can download these public-repository artifacts.

- **Windows x64:** Extract the ZIP and run the setup executable. If SmartScreen prompts, review the publisher details before choosing **More info → Run anyway** for a build you trust.
- **macOS Apple Silicon:** Open the DMG and drag SC Commander into Applications. For a trusted unsigned build blocked on first launch, use **System Settings → Privacy & Security → Open Anyway**.
- **Ubuntu 24.04 x64:** Extract the AppImage, make it executable, and open it. If FUSE is unavailable, launch it with `--appimage-extract-and-run`.

## License

Copyright © 2026 sparkoo.

SC is licensed under the [WTFPL version 2](LICENSE).
