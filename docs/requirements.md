# Requirements

## First release

Private testers should be able to install SC on Windows 11 x64, Ubuntu 24.04 x64, and macOS on Apple Silicon. Test builds are distributed as downloadable artifacts of a manually triggered GitHub Actions run on the public repository. Version-tagged release builds are published to GitHub Releases after cross-platform packaging and smoke tests.

### Appearance

The app icon uses two terminal panes on a transparent background, with the panes filling most of the icon width for legibility at taskbar sizes.

Start with a compact Radix Themes dark interface with slate neutrals, an amber accent, and square corners. Use 24-pixel file rows, narrow pane gutters, and compact headers and toolbars to maximize visible files with 12-pixel file names and 11-pixel size and date text. Active panes, keyboard focus, cursor, and marked files remain visually distinct.

The file panes start at the top of the app content, without an app title header. The bottom command bar includes Operations, with its job count and queue visibility toggle.

### Local browser

Each pane has an editable location, sortable name, size, and modification columns, and a count and size for the current selection. Start at home when there is no saved location. Returning to a parent focuses the folder just left. Directories appear first. When a parent exists and the Quick Search query is empty, a `..` navigation row stays above all entries regardless of sorting. Enter or double-click opens the parent and focuses the folder just left. This row cannot be marked or used for file operations and is excluded from item counts.

Each pane has its own folder tabs. Ctrl+T (Cmd+T on macOS) or the plus button opens a tab at the current folder. Click a tab to switch to it. Tabs remember their folder, navigation history, sort, cursor, marks, and Quick Search while open. Ctrl+W (Cmd+W on macOS) closes the active pane's selected tab. Middle-click closes the clicked tab. Closing the selected tab selects its right neighbor, or the left neighbor when there is no tab to the right. Each pane keeps at least one tab open. At startup, each pane opens one tab at its last selected location. On macOS, Cmd+Shift+W closes the window.

Tab and Shift+Tab switch focus between the two file lists from anywhere in the main window, including location fields and controls outside the panes. Open operation dialogs retain normal Tab navigation between their controls. Arrows move focus, Space or Insert toggles the mark on the current item and moves focus down one row when possible. Enter opens a directory or launches a file, and Backspace goes up when Quick Search is inactive. A plain left-click moves the cursor to the clicked row and preserves existing marks. Right-clicking a file or folder focuses its pane and toggles its mark while preserving other marks. Holding the right button and dragging across rows marks every file and folder crossed when starting on an unmarked row, and unmarks them when starting on a marked row. The parent row cannot be marked. F4 opens the active pane's quick-select menu, also available beside its path field. The menu refreshes when opened and offers Home and assigned drives with volume names on the left and drive letters such as `C:` on the right on Windows (repeating the drive letter on the left when a volume label is unavailable); Home, Filesystem `/`, and mounted data volumes and network shares on Linux; and Home, the startup disk, and volumes mounted under `/Volumes` on macOS. Internal system mounts are omitted. Optional Windows volume names load independently; a slow or disconnected drive does not delay selecting Home or another drive. Arrow keys and Enter select a place, Escape dismisses the menu, and selection returns focus to the pane's file list. Tab and Shift+Tab dismiss the menu and switch panes. Unavailable locations report the normal navigation error. Users can also reach mounted drives by path.

Typing in a file list starts Quick Search in that pane. The query appears in the top-right corner, and the list shows only files and folders with names containing the query, ignoring case. When the query changes, the cursor jumps to the first result in the current sort order whose name starts with the query, ignoring case. Backspace deletes the last character. An empty query restores the full list and further Backspace presses leave the pane in the current folder. Escape exits Quick Search. While searching, Space adds to the query and Insert marks a row. Changing folders exits Quick Search. Marks on filtered-out items are preserved and excluded from operations until those items are visible again.

Files and folders whose names start with a dot or have the Windows Hidden attribute are hidden by default. A visible **Show hidden** toggle in the bottom command bar affects both panes for the current app session. Ctrl+H (Cmd+Shift+. on macOS) toggles it from anywhere in the main window, including location fields; operation dialogs retain their normal keyboard handling. Turning it off clears marks and focus on hidden entries; hidden items are excluded from counts and operations. Explicit navigation to a hidden folder by path remains available.

### Local operations

F2 renames, F5 copies to the opposite pane, F6 moves there, F7 creates a folder, and F8 sends items to the OS trash. Show the target before transferring. When trash is unavailable, leave the item in place. A single background queue reports progress, conflicts, cancellations, and partial results.

Offer Skip, Keep both, and Replace for file collisions. Merge matching directories. Publish completed copies before removing their sources on cross-volume moves. Clean up interrupted work, preserve links where supported, and reject recursive self-copies.

The operations panel shows the current file, transferred bytes, conflicts, cancellation, and a detailed list of finished or skipped entries. Keep both chooses a numbered sibling. Replace is available for distinct regular files. Jobs stop on the first error. An in-progress directory transfer can leave completed children in the destination.

### Acceptance

- Browse 100,000 entries on each target OS. Record time to first rows and verify that the other pane remains usable while loading.
- Complete a keyboard-only copy, conflict resolution, rename, and trash cycle. Verify contents and focus after each step.
- On a full destination, denied access, or cancelled cross-drive move, identify completed and unfinished work. Verify unfinished sources remain intact.

## Settings

Settings shows the installed version, source commit and commit date when available, author, license, and a link that opens the GitHub repository in the system browser.

## Application updates

Installed release builds check for newer stable versions at launch. When an update is available, offer Install update and Later. Later defers the update for the current session. The prompt and Settings → Updates share a saved Automatically install future updates checkbox, off by default. When enabled, announce the update before installation starts and allow the user to defer it or turn off automatic installation. Wait for file operations to finish before installing, and restart after a successful installation. Installation errors leave the application open and allow a retry.

## Later milestones

Add thumbnail and image previews, SFTP over SSH, then FTP/FTPS. Recursive search and platform code signing are later milestones.
