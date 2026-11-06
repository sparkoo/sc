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
