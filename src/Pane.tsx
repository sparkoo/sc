import { DropdownMenu } from "@radix-ui/themes";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { compare, type BrowserPane, type Column, type Entry } from "./browser";
import { formatBytes } from "./format";
import { Icon } from "./Icons";

type Place = { id: string; name: string; path: string };

const ROW_HEIGHT = 24;

const date = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "2-digit",
});
export const listId = (side: number) => "file-list-" + side;
export function focusPane(side: number) {
  document.getElementById(listId(side))?.focus();
}

export function Pane({
  pane,
  side,
  active,
  activate,
  placesOpen,
  setPlacesOpen,
}: {
  pane: BrowserPane;
  side: number;
  active: boolean;
  activate(): void;
  placesOpen: boolean;
  setPlacesOpen(open: boolean): void;
}) {
  const [path, setPath] = useState("");
  const placesTrigger = useRef<HTMLButtonElement>(null);
  const placesMenu = useRef<HTMLDivElement>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [placesError, setPlacesError] = useState("");
  const [placesLoading, setPlacesLoading] = useState(false);
  useEffect(() => {
    if (!placesOpen) return;
    let current = true;
    setPlacesLoading(true);
    setPlacesError("");
    void invoke<Place[]>("quick_places")
      .then(
        (items) => {
          if (!current) return;
          setPlaces(items);
          for (const item of items) {
            if (item.name) continue;
            void invoke<string>("quick_place_label", { id: item.id }).then(
              (name) => {
                if (current && name) setPlaces((previous) => previous.map((place) =>
                  place.id === item.id ? { ...place, name } : place,
                ));
              },
              () => { /* Optional labels leave the drive-letter fallback in place. */ },
            );
          }
        },
        (error) => { if (current) setPlacesError(String(error)); },
      )
      .finally(() => { if (current) setPlacesLoading(false); });
    return () => { current = false; };
  }, [placesOpen]);
  const [sort, setSort] = useState<{ column: Column; reverse: boolean }>({
    column: "name",
    reverse: false,
  });
  const scroll = useRef<HTMLDivElement>(null);
  const search = useRef({ prefix: "", time: 0 });
  const rightDrag = useRef<{ rows: Entry[]; index: number; mark: boolean } | null>(null);
  const parent = pane.folder?.parent;
  const rows = useMemo(() => {
    const entries = [...pane.entries].sort((a, b) =>
      compare(a, b, sort.column, sort.reverse),
    );
    if (parent)
      entries.unshift({
        id: parent,
        name: "..",
        directory: true,
        link: false,
        hidden: false,
        size: 0,
        modified: null,
      });
    return entries;
  }, [pane.entries, parent, sort]);
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });
  const index = useMemo(
    () => rows.findIndex((entry) => entry.id === pane.cursor),
    [rows, pane.cursor],
  );
  const name = side ? "Right" : "Left";
  const selected = useMemo(
    () => rows.filter((entry) => pane.marked.has(entry.id)),
    [rows, pane.marked],
  );
  useEffect(() => {
    setPath(pane.folder?.path ?? "");
  }, [pane.folder]);
  useEffect(() => {
    if (!pane.loading && index < 0 && rows.length) pane.setCursor(rows[0].id);
  }, [pane.loading, index, rows, pane.setCursor]);
  useEffect(() => {
    if (index >= 0) virtual.scrollToIndex(index, { align: "auto" });
  }, [index, virtual]);

  function open(entry: Entry) {
    if (entry.id === parent) pane.up();
    else if (entry.directory) pane.navigate({ id: entry.id });
    else
      void invoke("open_file", { id: entry.id }).catch((e) =>
        pane.setError(String(e)),
      );
  }
  function toggle(id: string) {
    if (id === parent) return;
    pane.setMarked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function extendRightDrag(nextIndex: number, buttons: number) {
    const drag = rightDrag.current;
    if (!drag || drag.rows !== rows || !(buttons & 2)) {
      rightDrag.current = null;
      return;
    }
    if (drag.index === nextIndex) return;
    const start = Math.min(drag.index, nextIndex);
    const end = Math.max(drag.index, nextIndex);
    drag.index = nextIndex;
    const { mark } = drag;
    pane.setMarked((previous) => {
      const next = new Set(previous);
      for (const entry of rows.slice(start, end + 1)) {
        if (entry.id === parent) continue;
        if (mark) next.add(entry.id);
        else next.delete(entry.id);
      }
      return next;
    });
    if (rows[nextIndex].id !== parent) pane.setCursor(rows[nextIndex].id);
  }
  function key(event: KeyboardEvent) {
    const item = rows[index];
    const key = event.key;
    if (event.altKey && key === "ArrowLeft") pane.goHistory(-1);
    else if (event.altKey && key === "ArrowRight") pane.goHistory(1);
    else if (key === "Backspace") pane.up();
    else if (key === "Enter" && item) open(item);
    else if (key === " " && item) {
      toggle(item.id);
      if (rows[index + 1]) pane.setCursor(rows[index + 1].id);
    } else if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === "a")
      pane.setMarked(new Set(pane.entries.map((e) => e.id)));
    else if (
      ["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"].includes(
        key,
      ) &&
      rows.length
    ) {
      const page = Math.max(
        1,
        Math.floor((scroll.current?.clientHeight ?? 240) / ROW_HEIGHT),
      );
      const offsets: Record<string, number> = {
        ArrowDown: 1,
        ArrowUp: -1,
        Home: -rows.length,
        End: rows.length,
        PageDown: page,
        PageUp: -page,
      };
      pane.setCursor(
        rows[Math.max(0, Math.min(rows.length - 1, index + offsets[key]))].id,
      );
    } else if (
      key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const now = Date.now();
      const prefix =
        (now - search.current.time < 850 ? search.current.prefix : "") +
        key.toLocaleLowerCase();
      search.current = { prefix, time: now };
      const match = rows.find((e) =>
        e.name.toLocaleLowerCase().startsWith(prefix),
      );
      if (match) pane.setCursor(match.id);
    } else return;
    event.preventDefault();
  }
  return (
    <section
      data-side={side}
      className={"pane" + (active ? " active" : "")}
      aria-label={name + " pane"}
      onFocus={activate}
      onPointerDown={activate}
    >
      <div className="pane-header">
        <span className="pane-icon">
          <Icon name={side ? "right" : "left"} />
        </span>
        <h2>{name} pane</h2>
        <div className="nav">
          <button
            title="Back"
            aria-label="Back"
            disabled={pane.history.index <= 0}
            onClick={() => pane.goHistory(-1)}
          >
            <Icon name="back" />
          </button>
          <button
            title="Forward"
            aria-label="Forward"
            disabled={pane.history.index >= pane.history.items.length - 1}
            onClick={() => pane.goHistory(1)}
          >
            <Icon name="forward" />
          </button>
          <button
            title="Parent folder"
            aria-label="Parent folder"
            disabled={!pane.folder?.parent}
            onClick={() => pane.up()}
          >
            <Icon name="up" />
          </button>
        </div>
      </div>
      <form
        className="location"
        onSubmit={(e) => {
          e.preventDefault();
          pane.navigate({ path });
          focusPane(side);
        }}
      >
        <DropdownMenu.Root modal={false} open={placesOpen} onOpenChange={setPlacesOpen}>
          <DropdownMenu.Trigger>
            <button
              type="button"
              className="quick-places"
              ref={placesTrigger}
              title="Quick select (F4)"
              aria-label={name + " quick select"}
            >
              <Icon name="home" size={16} />
              <span aria-hidden="true">▾</span>
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content
            ref={placesMenu}
            size="1"
            onKeyDown={(event) => {
              if (event.key === "Tab") setPlacesOpen(false);
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              const focused = document.activeElement;
              if (
                focused instanceof HTMLElement && focused !== document.body &&
                !placesMenu.current?.contains(focused) && focused !== placesTrigger.current
              ) return;
              focusPane(side);
            }}
          >
            {placesLoading ? (
              <DropdownMenu.Item disabled>Loading places…</DropdownMenu.Item>
            ) : placesError ? (
              <DropdownMenu.Item disabled title={placesError}>Places unavailable</DropdownMenu.Item>
            ) : places.map((place) => (
              <DropdownMenu.Item
                key={place.id}
                title={place.path}
                textValue={place.name || place.path}
                aria-label={place.name ? `${place.name}, ${place.path}` : place.path}
                onSelect={() => pane.navigate({ id: place.id })}
              >
                {place.name || place.path.replace(/^([a-z]:)\\$/i, "$1")}
                {place.name !== place.path && (
                  <span className="place-path">
                    {/^[a-z]:\\$/i.test(place.path) ? place.path.slice(0, -1) : place.path}
                  </span>
                )}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
        <input
          aria-label={name + " folder path"}
          value={path}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setPath(pane.folder?.path ?? "");
              focusPane(side);
            }
          }}
        />
        <button
          type="button"
          title="Refresh"
          aria-label="Refresh"
          onClick={() => pane.refresh()}
        >
          <Icon name="refresh" size={15} />
        </button>
      </form>
      <div className="columns">
        {(["name", "size", "modified"] as const).map((column) => (
          <button
            key={column}
            onClick={() =>
              setSort({
                column,
                reverse: column === sort.column && !sort.reverse,
              })
            }
          >
            {column === "name"
              ? "Name"
              : column === "size"
                ? "Size"
                : "Modified"}{" "}
            {sort.column === column && (sort.reverse ? "↓" : "↑")}
          </button>
        ))}
      </div>
      <div
        id={listId(side)}
        className="files"
        role="listbox"
        aria-label={name + " files"}
        aria-multiselectable="true"
        aria-activedescendant={
          index >= 0 ? listId(side) + "-" + index : undefined
        }
        tabIndex={0}
        ref={scroll}
        onKeyDown={key}
      >
        {pane.entries.length === 0 && (
          <div className="empty">
            {pane.loading
              ? "Reading folder…"
              : pane.error
                ? "Folder unavailable"
                : "Empty folder"}
          </div>
        )}
        <div
          className="row-space"
          style={{ height: virtual.getTotalSize() }}
          onMouseLeave={() => { rightDrag.current = null; }}
          onMouseUp={(e) => {
            if (e.button === 2) rightDrag.current = null;
          }}
        >
          {virtual.getVirtualItems().map((v) => {
            const entry = rows[v.index];
            const marked = pane.marked.has(entry.id);
            return (
              <div
                id={listId(side) + "-" + v.index}
                key={entry.id}
                role="option"
                aria-selected={
                  marked || (pane.marked.size === 0 && index === v.index)
                }
                className={
                  "file-row" +
                  (marked ? " marked" : "") +
                  (index === v.index ? " cursor" : "")
                }
                style={{
                  height: ROW_HEIGHT,
                  transform: "translateY(" + v.start + "px)",
                }}
                onClick={(e) => {
                  focusPane(side);
                  pane.setCursor(entry.id);
                  if (e.ctrlKey || e.metaKey) toggle(entry.id);
                  else pane.setMarked(new Set());
                }}
                onContextMenu={(e) => e.preventDefault()}
                onMouseDown={(e) => {
                  if (e.button !== 2) return;
                  e.preventDefault();
                  if (entry.id === parent) return;
                  rightDrag.current = { rows, index: v.index, mark: !marked };
                  focusPane(side);
                  pane.setCursor(entry.id);
                  toggle(entry.id);
                }}
                onMouseEnter={(e) => extendRightDrag(v.index, e.buttons)}
                onDoubleClick={() => open(entry)}
              >
                <span className="file-name" title={entry.name}>
                  <span
                    className={entry.directory ? "folder-glyph" : "file-glyph"}
                  >
                    <Icon
                      name={
                        entry.link
                          ? "link"
                          : entry.directory
                            ? "folder"
                            : "file"
                      }
                      size={16}
                    />
                  </span>
                  <span>{entry.name}</span>
                </span>
                <span className="file-size">
                  {entry.directory ? "—" : formatBytes(entry.size)}
                </span>
                <span className="file-date">
                  {entry.modified === null
                    ? "—"
                    : date.format(entry.modified * 1000)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {pane.error && (
        <div role="alert" className="error">
          {pane.error}
        </div>
      )}
      <div className="pane-status">
        <span className="dot" />
        {pane.entries.length.toLocaleString()} items{pane.loading && " · Reading…"}
        <span className="status-selection">
          {selected.length
            ? selected.length +
              " marked · " +
              formatBytes(selected.reduce((n, e) => n + e.size, 0))
            : ""}
        </span>
      </div>
    </section>
  );
}
