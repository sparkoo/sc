import { Channel, invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";

export type Target = "home" | { id: string } | { path: string };
export type Folder = { id: string; path: string; parent: string | null; actions: string[] };
export type Entry = { id: string; name: string; directory: boolean; link: boolean; size: number; modified: number | null };
type Listing = { type: "opened"; data: Folder } | { type: "entries"; data: Entry[] } | { type: "done"; data: number };
export type Column = "name" | "size" | "modified";

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
export function compare(a: Entry, b: Entry, column: Column, reverse: boolean) {
  if (a.directory !== b.directory) return a.directory ? -1 : 1;
  const result = column === "name" ? 0 : (a[column] ?? 0) - (b[column] ?? 0);
  return (reverse ? -1 : 1) * (result || collator.compare(a.name, b.name));
}

export function useBrowser(pane: number) {
  const [folder, setFolder] = useState<Folder | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [history, setHistory] = useState({ items: [] as Folder[], index: -1 });
  const generation = useRef(Date.now() * 1000);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const navigate = useCallback((target: Target, options: { historyIndex?: number; focus?: string; restore?: boolean; refresh?: boolean } = {}) => {
    const request = ++generation.current;
    clearTimeout(timer.current);
    const buffer: Entry[] = [];
    const updates = new Channel<Listing>();
    setLoading(true);
    setError("");
    function flush() {
      timer.current = undefined;
      if (request === generation.current) setEntries(buffer.slice());
    }
    updates.onmessage = (message) => {
      if (request !== generation.current) return;
      switch (message.type) {
        case "opened": {
          const next = message.data;
          setFolder(next);
          setEntries([]);
          setMarked(new Set());
          setCursor(options.focus ?? "");
          localStorage.setItem("sc.folder." + pane, next.id);
          setHistory(prev => {
            if (options.historyIndex !== undefined) return { ...prev, index: options.historyIndex };
            if (prev.items[prev.index]?.id === next.id) return prev;
            const items = [...prev.items.slice(0, prev.index + 1), next];
            return { items, index: items.length - 1 };
          });
          break;
        }
        case "entries":
          buffer.push(...message.data);
          if (timer.current === undefined) timer.current = setTimeout(flush, buffer.length <= 256 ? 0 : 120);
          break;
        case "done":
          clearTimeout(timer.current);
          flush();
          setLoading(false);
          if (message.data) setError(message.data + " unreadable entries");
          break;
      }
    };
    void invoke("list_folder", { pane, generation: request, target, updates }).catch(reason => {
      if (request !== generation.current) return;
      if (options.restore) { navigate("home"); return; }
      setError(String(reason));
      setLoading(false);
    });
  }, [pane]);

  useEffect(() => {
    const saved = localStorage.getItem("sc.folder." + pane);
    navigate(saved ? { id: saved } : "home", { restore: Boolean(saved) });
    return () => { generation.current++; clearTimeout(timer.current); };
  }, [pane, navigate]);

  function goHistory(delta: number) {
    const index = history.index + delta;
    if (history.items[index]) navigate({ id: history.items[index].id }, { historyIndex: index });
  }
  function up() { if (folder?.parent) navigate({ id: folder.parent }, { focus: folder.id }); }
  function refresh(focus = cursor) { if (folder) navigate({ id: folder.id }, { focus }); }
  return { folder, entries, marked, setMarked, cursor, setCursor, loading, error, setError, history, goHistory, navigate, up, refresh };
}

export type BrowserPane = ReturnType<typeof useBrowser>;
