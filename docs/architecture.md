# Architecture

SC uses React and TypeScript for the panes and a Tauri 2 host written in Rust for access to the local machine. Local browsing and operations share the native path identity in the local storage module. Remote storage and previews are planned.

```text
Two independent panes (React)
         | typed commands / streamed listing batches and job updates
         v
Tauri command boundary (Rust)
         |                      |
   directory listing       transfer queue
         |                      |
         +--- storage provider -+
                      |
               local filesystem
```

## Frontend styling

A root Radix Themes provider owns the appearance, accent, neutral palette, and control sizing. Buttons, keyboard hints, and operation name fields use Radix components. A shared frontend row-height constant drives virtual row positions, rendered height, and page-key movement. Custom pane and virtualized-row CSS consumes the same theme tokens; native modal dialogs retain the existing focus and submission behavior.

## Opening a directory

The app-level keyboard handler owns Tab pane switching across the main window and yields to open operation dialogs. Pane components own file-list navigation and selection keys.

The `quick_places` command runs native location discovery in a Rust worker and returns display names, display paths, and opaque native path IDs. Windows initially returns assigned logical drive letters with empty names. The frontend requests optional native labels separately through `quick_place_label`, applies each result independently, and retains letter fallbacks for missing or pending labels. Rust limits native label queries to one in-flight worker per drive letter, so repeatedly opening the menu cannot accumulate stalled queries. Linux decodes `/proc/self/mountinfo` while filtering system mounts, and macOS reads the native mount table for `/Volumes` entries. The frontend refreshes this list on each menu opening and navigates using IDs through the existing listing command. The app coordinates which pane's menu is open and handles F4; pane components own menu rendering, loading, and focus.

The pane requests a listing with a monotonically increasing generation. Rust enumerates in a worker, encoding native path bytes as opaque IDs so a display name never identifies an operation target. A Tauri channel sends the resolved folder, batches of up to 256 entries, then a completion count of unreadable entries. A new request supersedes earlier generations for that pane. React coalesces incoming updates, sorts directory-first, and virtualizes the rows. The frontend prepends a synthetic `..` row using the parent ID supplied by Rust and routes it through the existing parent-navigation action. It stays outside the real entry collection used for operations, marking, and counts. Each pane owns its history, cursor and marks. Only the last location of each pane persists.

## Copying between panes

The frontend submits opaque source IDs and a destination to a single Rust worker queue. The UI polls compact job summaries every 250 ms while jobs are active and fetches detailed results on demand. A conflict suspends the worker until a token-matched decision or cancellation arrives. The panes stay interactive. Closing the window with pending work opens the queue.

Moves first try an exclusive OS rename. A cross-volume move falls back to a staged copy in the destination directory. Regular files are copied in chunks, synced, then published with no-clobber semantics unless the user explicitly approved replacement. After a successful publication, a move removes its source. On failure, completed entries remain available in the report and unfinished source files stay in place. Folder collisions merge recursively, and unsupported special files report an error. Trash uses the platform trash service. The UI refreshes both panes after completion.

## File metadata

Regular-file copies use the Windows native copy API to retain alternate data streams and report cancellation. On Unix the staged file receives the source's extended attributes, modification time, and permissions. A metadata-copy error aborts before publishing the staged file. The source's identity, size, and modification time are checked before publication and again before removal on a move. A detected external edit preserves the source and reports an error.

## Provider interface

The internal `StorageProvider` interface owns directory streaming, external opening, and execution of typed file requests. The Tauri commands and queue share a single local provider. Each listed folder advertises its supported actions, which determines the available pane commands. Local staging, permissions, and rename semantics stay inside the provider implementation. When SFTP arrives, add provider routing and stream-based transfers between providers. A future preview provider will consume content through storage. The public plugin API follows those two concrete implementations.
