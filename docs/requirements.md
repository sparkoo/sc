# Requirements

## First release

Private testers should be able to install SC on Windows 11 x64, Ubuntu 24.04 x64, and macOS on Apple Silicon. Test builds are distributed as downloadable artifacts of a manually triggered GitHub Actions run on the public repository.

### Appearance

Start with a compact Radix Themes dark interface with slate neutrals and an iris accent. Open the Radix Theme Panel on launch for live experiments with appearance, accent, neutrals, rounding, and control scale. The header Theme button reopens it after hiding it with its T button. Experiments last for the current app session; Copy Theme copies the configuration. Active panes, keyboard focus, cursor, and marked files remain visually distinct.

### Local browser

Each pane has an editable location, its own history, sortable name, size, and modification columns, and a count and size for the current selection. Start at home and restore the last successful location of each pane. Returning to a parent focuses the folder just left. Directories appear first.

Tab switches panes, arrows move focus, Space marks an item, typing jumps by name, Enter opens a directory or launches a file, and Backspace goes up. Mouse commands mirror the keyboard workflow. Users can reach mounted drives by path.

### Local operations

F2 renames, F5 copies to the opposite pane, F6 moves there, F7 creates a folder, and F8 sends items to the OS trash. Show the target before transferring. When trash is unavailable, leave the item in place. A single background queue reports progress, conflicts, cancellations, and partial results.

Offer Skip, Keep both, and Replace for file collisions. Merge matching directories. Publish completed copies before removing their sources on cross-volume moves. Clean up interrupted work, preserve links where supported, and reject recursive self-copies.

The operations panel shows the current file, transferred bytes, conflicts, cancellation, and a detailed list of finished or skipped entries. Keep both chooses a numbered sibling. Replace is available for distinct regular files. Jobs stop on the first error. An in-progress directory transfer can leave completed children in the destination.

### Acceptance

- Browse 100,000 entries on each target OS. Record time to first rows and verify that the other pane remains usable while loading.
- Complete a keyboard-only copy, conflict resolution, rename, and trash cycle. Verify contents and focus after each step.
- On a full destination, denied access, or cancelled cross-drive move, identify completed and unfinished work. Verify unfinished sources remain intact.

## Later milestones

Add thumbnail and image previews, SFTP over SSH, then FTP/FTPS. Per-pane tabs, recursive search, public signing, and updates are outside the first release.
