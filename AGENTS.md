# Working on SC

Read [the requirements](docs/requirements.md) and [the architecture](docs/architecture.md) before changing behavior. Keep the README focused on getting started.

- Make small, focused commits often. Each commit should leave the project usable and pass its relevant checks. Use short-lived branches and pull requests after the initial bootstrap. Preserve the individual commits when merging.
- Keep filesystem access and transfer decisions in Rust. Keep pane focus, keyboard interaction, and rendering in the frontend.
- Update requirements with changes to user-visible behavior, architecture with changes to responsibilities or interfaces, and this file with changes to the development workflow. Include those updates in the same pull request.
- Exercise destructive operations only in disposable test directories. Verify both source and destination after a failed or cancelled transfer.

## Worktree workflow

- Keep the primary checkout on `master` and free of task edits. Do all repository edits, including documentation and configuration changes, in a separate worktree on a short-lived `codex/<task>` branch.
- Keep committed documentation and configuration portable. Do not include developer-specific absolute paths, usernames, hostnames, or local environment details; describe locations relative to the repository or discover them at runtime.
- Apply this automatically to every task that changes files; the user does not need to request a feature branch or worktree. Read-only investigation can use the primary checkout.
- Before editing, inspect the current checkout and existing worktrees. Reuse this chat's suitable task worktree; otherwise create and attach a managed worktree from the latest fetched `origin/master`, then create its task branch. Use the worktree's absolute path for all edits, commands, checks, and commits.
- Preserve existing local edits and commits. If work starts in the primary checkout, safely move only the task's changes into its worktree before restoring the primary checkout to `master`. Never discard or mix unrelated work. If separation is ambiguous, leave the files intact and ask.
- Keep independent tasks in separate worktrees and PRs. Reconcile relevant changes from `master` before merging and rerun affected checks. Preserve individual commits when merging.
- After a confirmed PR merge, update the clean primary checkout with a fast-forward to `origin/master`. Keep task worktrees until their work is merged or the user explicitly requests cleanup.

## Local checks

Run `npm ci` after fetching dependency changes. Run `npm test` and `npm run build` for the frontend. From `src-tauri`, run `cargo fmt --check`, `cargo clippy --locked --all-targets -- -D warnings`, and `cargo test --locked`. Build the frontend first so Rust can embed the production assets. Use `npm run tauri -- dev` for interactive verification.

To exercise the real webview and filesystem, build with `npm run tauri -- build --no-bundle --debug --features ui-test`, then run `python tests/desktop.py`. This uses temporary folders and measures the first visible rows in a 100,000-entry directory. Set `SC_UI_ENTRIES` to a smaller number for quick local iterations. The released installer excludes the UI test driver.
