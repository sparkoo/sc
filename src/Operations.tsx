import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { BrowserPane } from "./browser";
import { formatBytes } from "./format";

export const commands = [
  { key: "F2", action: "rename", label: "Rename" },
  { key: "F5", action: "copy", label: "Copy" },
  { key: "F6", action: "move", label: "Move" },
  { key: "F7", action: "newFolder", label: "New folder" },
  { key: "F8", action: "trash", label: "Trash" },
] as const;
export type Action = (typeof commands)[number]["action"];
type Job = {
  id: number;
  action: Action;
  phase: string;
  current: string;
  bytes: number;
  records: number;
  error: string | null;
  conflict: { token: number; path: string; replace: boolean } | null;
};
const complete = (job: Job) =>
  ["finished", "cancelled", "failed"].includes(job.phase);
export type Prompt = {
  action: Action;
  names: string[];
  ids: string[];
  destination: string;
  path: string;
};
export function prepare(
  action: Action,
  from: BrowserPane,
  to: BrowserPane,
): Prompt | null {
  const destination =
    action === "copy" || action === "move" ? to.folder : from.folder;
  if (
    !destination ||
    !from.folder?.actions.includes(action) ||
    from.loading ||
    ((action === "copy" || action === "move") && to.loading)
  )
    return null;
  const selected =
    action === "newFolder"
      ? []
      : from.entries.filter((e) =>
          from.marked.size ? from.marked.has(e.id) : e.id === from.cursor,
        );
  if (action !== "newFolder" && !selected.length) return null;
  if (action === "rename" && selected.length !== 1) return null;
  return {
    action,
    names: selected.map((e) => e.name),
    ids: selected.map((e) => e.id),
    destination: destination.id,
    path: destination.path,
  };
}

export function OperationDialog({
  prompt,
  close,
  submitted,
}: {
  prompt: Prompt;
  close(): void;
  submitted(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(
    prompt.action === "rename" ? prompt.names[0] : "",
  );
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const title = commands.find((c) => c.action === prompt.action)!.label;
  const editName = prompt.action === "rename" || prompt.action === "newFolder";
  useEffect(() => {
    dialog.current?.showModal();
    dialog.current?.querySelector("input")?.select();
  }, []);
  async function submit() {
    if (sending) return;
    setSending(true);
    try {
      await invoke("start_job", {
        request: {
          action: prompt.action,
          sources: prompt.ids,
          directory: prompt.destination,
          name: editName ? name : null,
        },
      });
      submitted();
      close();
    } catch (reason) {
      setError(String(reason));
      setSending(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="dialog"
      onCancel={close}
      aria-labelledby="operation-title"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2 id="operation-title">
          {title}
          {editName ? "" : prompt.names.length === 1 ? " item" : " items"}
        </h2>
        {prompt.names.length > 0 && (
          <p className="subject">
            {prompt.names.length === 1
              ? prompt.names[0]
              : prompt.names.length + " selected items"}
          </p>
        )}
        {editName ? (
          <label>
            Name
            <input
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        ) : prompt.action === "trash" ? (
          <p>Move the selection to the system trash?</p>
        ) : (
          <label>
            Destination<output>{prompt.path}</output>
          </label>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button autoFocus={!editName} className="primary" disabled={sending}>
            {title}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function useJobs(onComplete: () => void) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const finished = useRef(new Set<number>());
  const callback = useRef(onComplete);
  callback.current = onComplete;
  const update = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    let active = true;
    let timeout: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await invoke<Job[]>("job_list");
        if (!active) return;
        setJobs(next);
        let refresh = false;
        for (const job of next.filter(complete)) {
          if (!finished.current.has(job.id)) {
            finished.current.add(job.id);
            refresh = true;
          }
        }
        if (refresh) callback.current();
        if (next.some((j) => !complete(j))) timeout = setTimeout(poll, 250);
      } catch (err) {
        if (active) setError(String(err));
      }
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [revision]);
  useEffect(() => {
    const off = listen("queue-needs-attention", () => {
      setVisible(true);
      setError("Finish or cancel active jobs before closing.");
    });
    return () => {
      void off.then((stop) => stop());
    };
  }, []);
  async function send(command: string, args: Record<string, unknown>) {
    try {
      await invoke(command, args);
      setError("");
      update();
    } catch (e) {
      setError(String(e));
    }
  }
  return { jobs, visible, setVisible, error, setError, update, send };
}

export function JobPanel({ queue }: { queue: ReturnType<typeof useJobs> }) {
  const [report, setReport] = useState<{ id: number; lines: string[] } | null>(
    null,
  );
  const { jobs, visible, error } = queue;
  if (!visible) return null;
  return (
    <aside className="job-panel" aria-label="File operations">
      <div className="job-heading">
        <h2>Operations</h2>
        <button onClick={() => queue.setVisible(false)}>Close</button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!jobs.length && <p className="quiet">The queue is empty.</p>}
      {[...jobs].reverse().map((job) => (
        <div key={job.id} className="job">
          <div className="job-summary">
            <strong>
              {commands.find((c) => c.action === job.action)?.label}
            </strong>
            <span>
              {job.phase} · {formatBytes(job.bytes)} · {job.records} results
            </span>
            {!complete(job) ? (
              <button
                onClick={() => void queue.send("cancel_job", { id: job.id })}
              >
                Cancel
              </button>
            ) : (
              <button
                onClick={() => {
                  if (report?.id === job.id) {
                    setReport(null);
                    return;
                  }
                  void invoke<string[]>("job_report", { id: job.id })
                    .then((lines) => setReport({ id: job.id, lines }))
                    .catch((e) => queue.setError(String(e)));
                }}
              >
                Details
              </button>
            )}
          </div>
          {job.current && <div className="job-path">{job.current}</div>}
          {job.error && <div className="error">{job.error}</div>}
          {job.conflict && (
            <div className="conflict">
              <span>Already exists · {job.conflict.path}</span>
              {[
                "skip",
                "keepBoth",
                ...(job.conflict.replace ? ["replace"] : []),
              ].map((decision) => (
                <button
                  key={decision}
                  onClick={() =>
                    void queue.send("answer_conflict", {
                      id: job.id,
                      token: job.conflict!.token,
                      decision,
                    })
                  }
                >
                  {decision === "keepBoth"
                    ? "Keep both"
                    : decision === "skip"
                      ? "Skip"
                      : "Replace file"}
                </button>
              ))}
            </div>
          )}
          {report?.id === job.id && (
            <pre>{report.lines.join("\n") || "No changes completed."}</pre>
          )}
        </div>
      ))}
    </aside>
  );
}
