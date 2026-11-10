# Requirements

## First release

Private testers should be able to install SC on Windows 11 x64, Ubuntu 24.04 x64, and macOS on Apple Silicon. Test builds are distributed as downloadable artifacts of a manually triggered GitHub Actions run on the public repository.

### Appearance

Start with a compact Radix Themes dark interface with slate neutrals, an amber accent, and square corners. Use 24-pixel file rows, narrow pane gutters, and compact headers and toolbars to maximize visible files with 12-pixel file names and 11-pixel size and date text. Active panes, keyboard focus, cursor, and marked files remain visually distinct.

The file panes start at the top of the app content, without an app title header. The bottom command bar includes Operations, with its job count and queue visibility toggle.

### Local browser

Each pane has an editable location, its own history, sortable name, size, and modification columns, and a count and size for the current selection. Start at home and restore the last successful location of each pane. Returning to a parent focuses the folder just left. Directories appear first. When a parent exists, a `..` navigation row stays above all entries regardless of sorting. Enter or double-click opens the parent and focuses the folder just left. This row cannot be marked or used for file operations and is excluded from item counts.

Tab and Shift+Tab switch focus between the two file lists from anywhere in the main window, including location fields and controls outside the panes. Open operation dialogs retain normal Tab navigation between their controls. Arrows move focus, Space marks an item, typing jumps by name, Enter opens a directory or launches a file, and Backspace goes up. Mouse commands mirror the keyboard workflow. F4 opens the active pane's quick-select menu, also available beside its path field. The menu refreshes when opened and offers Home and assigned drives with volume names on the left and drive letters such as `C:` on the right on Windows (repeating the drive letter on the left when a volume label is unavailable); Home, Filesystem `/`, and mounted data volumes and network shares on Linux; and Home, the startup disk, and volumes mounted under `/Volumes` on macOS. Internal system mounts are omitted. Optional Windows volume names load independently; a slow or disconnected drive does not delay selecting Home or another drive. Arrow keys and Enter select a place, Escape dismisses the menu, and selection returns focus to the pane's file list. Tab and Shift+Tab dismiss the menu and switch panes. Unavailable locations report the normal navigation error. Users can also reach mounted drives by path.

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
