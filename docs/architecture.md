# Architecture

SC uses React and TypeScript for the panes and a Tauri 2 host written in Rust for access to the local machine. The local listing flow is implemented. The transfer queue and additional providers are the next milestones.

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

The frontend submits the selected entries and destination. The Rust queue serializes jobs, checks for conflicts, stages file copies in the destination directory, and publishes completed output. It reports progress and asks for conflict decisions without blocking either pane. A move removes a source only after the destination succeeds. The frontend refreshes affected listings when a job finishes.

## Extension points

The local storage provider is the first implementation. Add SFTP as a second provider before stabilizing a public plugin interface. Providers describe which operations they support, including trash. A future preview provider will consume content through storage rather than assume that every entry has a local path.
