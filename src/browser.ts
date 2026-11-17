import { Channel, invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type Target = "home" | { id: string } | { path: string };
export type Folder = {
  id: string;
  path: string;
  parent: string | null;
  actions: string[];
};
export type Entry = {
  id: string;
  name: string;
  directory: boolean;
  link: boolean;
  hidden: boolean;
  size: number;
  modified: number | null;
};
type Listing =
  | { type: "opened"; data: Folder }
  | { type: "entries"; data: Entry[] }
  | { type: "done"; data: number };
export type Column = "name" | "size" | "modified";

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});
export function compare(a: Entry, b: Entry, column: Column, reverse: boolean) {
  if (a.directory !== b.directory) return a.directory ? -1 : 1;
  const result = column === "name" ? 0 : (a[column] ?? 0) - (b[column] ?? 0);
  return (reverse ? -1 : 1) * (result || collator.compare(a.name, b.name));
}

type BrowseOptions = {
  historyIndex?: number;
  focus?: string;
  restore?: boolean;
  refresh?: boolean;
  preserveMarks?: boolean;
};
type Request = { target: Target; options: BrowseOptions };
type Tab = {
  id: number;
  folder: Folder | null;
  allEntries: Entry[];
  marked: Set<string>;
  cursor: string;
  query: string | null;
  error: string;
  history: { items: Folder[]; index: number };
  sort: { column: Column; reverse: boolean };
  pending: Request | null;
  stale: boolean;
};

function createTab(id: number, target: Target, options: BrowseOptions = {}): Tab {
  return {
    id,
    folder: null,
    allEntries: [],
    marked: new Set(),
    cursor: "",
    query: null,
    error: "",
    history: { items: [], index: -1 },
    sort: { column: "name", reverse: false },
    pending: { target, options },
    stale: false,
  };
}

export function useBrowser(pane: number, showHidden = false) {
  const storageKey = "sc.folder." + pane;
  const [tabs, setTabs] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    return [createTab(0, saved ? { id: saved } : "home", { restore: Boolean(saved) })];
  });
  const [activeId, setActiveId] = useState(0);
  const nextId = useRef(1);
  const tab = tabs.find(({ id }) => id === activeId)!;
  const { folder, allEntries, marked, cursor, query, error, history, sort } = tab;
  const { pending, stale } = tab;
  const loading = pending !== null;
  const generation = useRef(Date.now() * 1000);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef<number | null>(null);

  const updateTab = useCallback((id: number, update: (previous: Tab) => Tab) => {
    setTabs((previous) => previous.map((item) => item.id === id ? update(item) : item));
  }, []);

  const start = useCallback(function list(id: number, { target, options }: Request) {
    const request = ++generation.current;
    inFlight.current = id;
    clearTimeout(timer.current);
    timer.current = undefined;
    const buffer: Entry[] = [];
    const updates = new Channel<Listing>();
    updateTab(id, (previous) => ({
      ...previous, pending: { target, options }, error: "", stale: false,
    }));

    function flush() {
      timer.current = undefined;
      if (request !== generation.current) return;
      const entries = buffer.slice();
      updateTab(id, (previous) => ({ ...previous, allEntries: entries }));
    }

    updates.onmessage = (message) => {
      if (request !== generation.current) return;
      switch (message.type) {
        case "opened": {
          const next = message.data;
          updateTab(id, (previous) => {
            const { items, index } = previous.history;
            const nextHistory = options.historyIndex !== undefined
              ? { items, index: options.historyIndex }
              : items[index]?.id === next.id
                ? previous.history
                : { items: [...items.slice(0, index + 1), next], index: index + 1 };
            return {
              ...previous,
              folder: next,
              allEntries: options.preserveMarks ? previous.allEntries : [],
              marked: options.preserveMarks ? previous.marked : new Set(),
              cursor: options.preserveMarks ? previous.cursor : options.focus ?? "",
              query: options.refresh ? previous.query : null,
              history: nextHistory,
            };
          });
          break;
        }
        case "entries":
          buffer.push(...message.data);
          // A refresh that retains marks keeps the full cached listing available until done.
          if (!options.preserveMarks && timer.current === undefined)
            timer.current = setTimeout(flush, buffer.length <= 256 ? 0 : 120);
          break;
        case "done":
          clearTimeout(timer.current);
          flush();
          inFlight.current = null;
          updateTab(id, (previous) => ({
            ...previous,
            marked: options.preserveMarks
              ? new Set(buffer.filter((entry) => previous.marked.has(entry.id)).map((entry) => entry.id))
              : previous.marked,
            pending: null,
            error: message.data ? message.data + " unreadable entries" : "",
          }));
          break;
      }
    };
    void invoke("list_folder", { pane, generation: request, target, updates }).catch((reason) => {
      if (request !== generation.current) return;
      if (options.restore) {
        list(id, { target: "home", options: {} });
        return;
      }
      clearTimeout(timer.current);
      timer.current = undefined;
      inFlight.current = null;
      updateTab(id, (previous) => ({ ...previous, pending: null, error: String(reason) }));
    });
  }, [pane, updateTab]);

  useEffect(() => () => {
    generation.current++;
    inFlight.current = null;
    clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (folder) localStorage.setItem(storageKey, folder.id);
  }, [storageKey, folder]);

  useEffect(() => {
    if (pending && inFlight.current !== activeId) start(activeId, pending);
    else if (!pending && stale && folder) {
      start(activeId, {
        target: { id: folder.id },
        options: { refresh: true, preserveMarks: true },
      });
    }
  }, [activeId, folder, pending, stale, start]);

  const unhiddenEntries = useMemo(
    () => showHidden ? allEntries : allEntries.filter((entry) => !entry.hidden),
    [allEntries, showHidden],
  );
  const visibleIds = useMemo(() => new Set(unhiddenEntries.map((entry) => entry.id)), [unhiddenEntries]);
  const entries = useMemo(() => {
    if (!query) return unhiddenEntries;
    const needle = query.toLocaleLowerCase();
    return unhiddenEntries.filter((entry) => entry.name.toLocaleLowerCase().includes(needle));
  }, [query, unhiddenEntries]);
  const matchingIds = useMemo(
    () => query ? new Set(entries.map((entry) => entry.id)) : visibleIds,
    [entries, query, visibleIds],
  );
  const visibleMarks = useMemo(
    () => new Set([...marked].filter((id) => matchingIds.has(id))),
    [marked, matchingIds],
  );
  useEffect(() => {
    if (showHidden) return;
    setTabs((previous) => previous.map((item) => {
      if (!item.marked.size && !item.cursor) return item;
      const hidden = new Set(item.allEntries.filter((entry) => entry.hidden).map((entry) => entry.id));
      const marked = new Set([...item.marked].filter((id) => !hidden.has(id)));
      const cursor = hidden.has(item.cursor) ? "" : item.cursor;
      return marked.size === item.marked.size && cursor === item.cursor
        ? item
        : { ...item, marked, cursor };
    }));
  }, [showHidden]);

  const setMarked = useCallback((update: (previous: Set<string>) => Set<string>) => {
    updateTab(activeId, (previous) => ({ ...previous, marked: update(previous.marked) }));
  }, [activeId, updateTab]);
  const setCursor = useCallback((cursor: string) => {
    updateTab(activeId, (previous) => previous.cursor === cursor ? previous : { ...previous, cursor });
  }, [activeId, updateTab]);
  function setQuery(value: string | null | ((previous: string | null) => string)) {
    updateTab(activeId, (previous) => ({
      ...previous, query: typeof value === "function" ? value(previous.query) : value,
    }));
  }
  function setSort(sort: Tab["sort"]) {
    updateTab(activeId, (previous) => ({ ...previous, sort }));
  }
  function setError(error: string) {
    updateTab(activeId, (previous) => ({ ...previous, error }));
  }

  function navigate(target: Target, options: BrowseOptions = {}) {
    start(activeId, { target, options });
  }
  function goHistory(delta: number) {
    const index = history.index + delta;
    if (history.items[index])
      navigate({ id: history.items[index].id }, { historyIndex: index });
  }
  function up() {
    if (folder?.parent) navigate({ id: folder.parent }, { focus: folder.id });
  }
  function refresh(focus = cursor) {
    if (folder) navigate({ id: folder.id }, { focus, refresh: true });
  }
  function invalidateListings() {
    setTabs((previous) => previous.map((item) => ({ ...item, stale: true })));
    if (!loading) refresh();
  }

  function selectTab(id: number) {
    if (activeId === id) return;
    setActiveId(id);
  }

  function openTab() {
    const target = folder ? { id: folder.id } : "home";
    const next = createTab(nextId.current++, target, { restore: Boolean(folder) });
    setTabs((previous) => [...previous, next]);
    setActiveId(next.id);
  }

  function closeTab(id = activeId) {
    const index = tabs.findIndex((item) => item.id === id);
    if (tabs.length <= 1 || index < 0) return;
    if (inFlight.current === id) {
      generation.current++;
      inFlight.current = null;
      clearTimeout(timer.current);
      timer.current = undefined;
    }
    if (id === activeId) selectTab(tabs[index + 1]?.id ?? tabs[index - 1].id);
    setTabs((previous) => previous.filter((item) => item.id !== id));
  }

  return {
    activeId,
    tabs,
    selectTab,
    openTab,
    closeTab,
    folder,
    entries,
    marked: visibleMarks,
    setMarked,
    cursor: query && !matchingIds.has(cursor) ? "" : cursor,
    setCursor,
    query,
    setQuery,
    sort,
    setSort,
    loading,
    error,
    setError,
    history,
    goHistory,
    navigate,
    up,
    refresh,
    invalidateListings,
  };
}

export type BrowserPane = ReturnType<typeof useBrowser>;
