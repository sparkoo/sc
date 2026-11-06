# Architecture

SC uses React and TypeScript for the panes and a Tauri 2 host written in Rust for access to the local machine. This document describes the target architecture. The bootstrap commit establishes the project structure and requirements.

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

The pane requests a listing. Rust enumerates in a worker, retaining native path identity, and streams batches with display metadata. The pane ignores responses from superseded requests, renders visible rows, and owns navigation, sorting, focus, and marking. Each pane has independent state.

## Copying between panes

The frontend submits the selected entries and destination. The Rust queue serializes jobs, checks for conflicts, stages file copies in the destination directory, and publishes completed output. It reports progress and asks for conflict decisions without blocking either pane. A move removes a source only after the destination succeeds. The frontend refreshes affected listings when a job finishes.

## Extension points

The local storage provider is the first implementation. Add SFTP as a second provider before stabilizing a public plugin interface. Providers describe which operations they support, including trash. A future preview provider will consume content through storage rather than assume that every entry has a local path.
