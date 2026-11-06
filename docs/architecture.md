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

## Opening a directory

The pane requests a listing with a monotonically increasing generation. Rust enumerates in a worker, encoding native path bytes as opaque IDs so a display name never identifies an operation target. A Tauri channel sends the resolved folder, batches of up to 256 entries, then a completion count of unreadable entries. A new request supersedes earlier generations for that pane. React coalesces incoming updates, sorts directory-first, and virtualizes the rows. Each pane owns its history, cursor and marks. Only the last location of each pane persists.

## Copying between panes

The frontend submits opaque source IDs and a destination to a single Rust worker queue. The UI polls compact job summaries every 250 ms while jobs are active and fetches detailed results on demand. A conflict suspends the worker until a token-matched decision or cancellation arrives. The panes stay interactive. Closing the window with pending work opens the queue.

Moves first try an exclusive OS rename. A cross-volume move falls back to a staged copy in the destination directory. Regular files are copied in chunks, synced, then published with no-clobber semantics unless the user explicitly approved replacement. After a successful publication, a move removes its source. On failure, completed entries remain available in the report and unfinished source files stay in place. Folder collisions merge recursively, and unsupported special files report an error. Trash uses the platform trash service. The UI refreshes both panes after completion.

## Extension points

The local storage provider is the first implementation. Add SFTP as a second provider before stabilizing a public plugin interface. Providers describe which operations they support, including trash. A future preview provider will consume content through storage rather than assume that every entry has a local path.
