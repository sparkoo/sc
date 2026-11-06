# Working on SC

Read [the requirements](docs/requirements.md) and [the architecture](docs/architecture.md) before changing behavior. Keep the README focused on getting started.

- Make small, focused commits often. Each commit should leave the project usable and pass its relevant checks. Use short-lived branches and pull requests after the initial bootstrap. Preserve the individual commits when merging.
- Keep filesystem access and transfer decisions in Rust. Keep pane focus, keyboard interaction, and rendering in the frontend.
- Update requirements with changes to user-visible behavior, architecture with changes to responsibilities or interfaces, and this file with changes to the development workflow. Include those updates in the same pull request.
- Exercise destructive operations only in disposable test directories. Verify both source and destination after a failed or cancelled transfer.
