import { Button, TextField } from "@radix-ui/themes";
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
  const confirm = useRef<HTMLButtonElement>(null);
  const [name, setName] = useState(
    prompt.action === "rename" ? prompt.names[0] : "",
  );
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const title = commands.find((c) => c.action === prompt.action)!.label;
  const editName = prompt.action === "rename" || prompt.action === "newFolder";
  useEffect(() => {
    dialog.current?.showModal();
    if (!editName) confirm.current?.focus();
    dialog.current?.querySelector("input")?.select();
  }, [editName]);
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
            <TextField.Root
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
          <Button size="1" variant="soft" type="button" onClick={close}>
            Cancel
          </Button>
          <Button
            size="1"
            variant="solid"
            type="submit"
            ref={confirm}
            disabled={sending}
          >
            {title}
          </Button>
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
  const [closeBlocked, setCloseBlocked] = useState(false);
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
      setCloseBlocked(true);
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
  return { jobs, visible, setVisible, error, setError, update, send, closeBlocked, setCloseBlocked };
}

function QueueDialog({
  title,
  cancel,
  children,
  onKeyDown,
}: {
  title: string;
  cancel?: () => void;
  children: React.ReactNode;
  onKeyDown?: React.KeyboardEventHandler<HTMLDialogElement>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    element.querySelector<HTMLElement>("[data-default-action]")?.focus();
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="dialog"
      aria-labelledby="queue-dialog-title"
      onKeyDown={onKeyDown}
      onCancel={(event) => {
        event.preventDefault();
        cancel?.();
      }}
    >
      <h2 id="queue-dialog-title">{title}</h2>
      {children}
    </dialog>
  );
}

export function CloseBlockedDialog({ dismiss }: { dismiss: () => void }) {
  return (
    <QueueDialog title="File operations are still active" cancel={dismiss}>
      <p>Wait for the jobs to finish or cancel them in Operations before closing.</p>
      <div className="dialog-actions">
        <Button size="1" onClick={dismiss}>OK</Button>
      </div>
    </QueueDialog>
  );
}

export function ConflictDialog({
  id,
  conflict,
  update,
}: {
  id: number;
  conflict: NonNullable<Job["conflict"]>;
  update: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  async function resolve(decision?: "skip" | "keepBoth" | "replace") {
    if (sending) return;
    setSending(true);
    setError("");
    try {
      if (decision)
        await invoke("answer_conflict", { id, token: conflict.token, decision });
      else
        await invoke("cancel_job", { id });
      update();
    } catch (reason) {
      setError(String(reason));
      setSending(false);
      update();
    }
  }
  return (
    <QueueDialog title="Destination already exists" onKeyDown={(event) => {
      if (sending || event.altKey || event.ctrlKey || event.metaKey) return;
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-shortcut]")];
      const direction = ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1
        : ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : 0;
      if (direction) {
        event.preventDefault();
        const current = buttons.findIndex((button) => button === document.activeElement);
        buttons[(current + direction + buttons.length) % buttons.length]?.focus();
        return;
      }
      const shortcut = buttons.find((button) => button.dataset.shortcut === event.key.toLowerCase());
      if (shortcut) {
        event.preventDefault();
        if (!event.repeat) shortcut.click();
      }
    }}>
      <label>Destination<output>{conflict.path}</output></label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="dialog-actions conflict-actions">
        <Button size="1" variant="soft" data-shortcut="c" aria-keyshortcuts="C" disabled={sending} onClick={() => void resolve()}>
          <span><u>C</u>ancel job</span>
        </Button>
        <Button size="1" variant="soft" data-shortcut="s" aria-keyshortcuts="S" disabled={sending} onClick={() => void resolve("skip")}>
          <span><u>S</u>kip</span>
        </Button>
        <Button size="1" data-default-action="" data-shortcut="k" aria-keyshortcuts="K" disabled={sending} onClick={() => void resolve("keepBoth")}>
          <span><u>K</u>eep both</span>
        </Button>
        {conflict.replace && (
          <Button size="1" variant="soft" data-shortcut="r" aria-keyshortcuts="R" disabled={sending} onClick={() => void resolve("replace")}>
            <span><u>R</u>eplace file</span>
          </Button>
        )}
      </div>
    </QueueDialog>
  );
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
        <Button size="1" variant="soft" onClick={() => queue.setVisible(false)}>
          Close
        </Button>
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
              <Button
                size="1"
                variant="soft"
                onClick={() => void queue.send("cancel_job", { id: job.id })}
              >
                Cancel
              </Button>
            ) : (
              <Button
                size="1"
                variant="soft"
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
              </Button>
            )}
          </div>
          {job.current && <div className="job-path">{job.current}</div>}
          {job.error && <div className="error">{job.error}</div>}
          {report?.id === job.id && (
            <pre>{report.lines.join("\n") || "No changes completed."}</pre>
          )}
        </div>
      ))}
    </aside>
  );
}
