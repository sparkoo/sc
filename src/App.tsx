import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useBrowser } from "./browser";
import { focusPane, Pane } from "./Pane";

export function App() {
  const left = useBrowser(0), right = useBrowser(1);
  const panes = [left, right];
  const [active, setActive] = useState(0);
  useEffect(() => { focusPane(0); }, []);
  useEffect(() => {
    if (!left.loading && !right.loading && left.folder && right.folder) void invoke("frontend_ready");
  }, [left.loading, right.loading, left.folder, right.folder]);
  return <main className="shell">
    <header className="app-header"><span className="app-mark" aria-hidden="true"><b>›</b><i /></span><h1>SC <strong>Commander</strong></h1></header>
    <div className="panes">{panes.map((pane, side) => <Pane key={side} pane={pane} side={side} active={active === side}
      activate={() => setActive(side)} switchPane={() => { setActive(1-side); focusPane(1-side); }} />)}</div>
    <footer className="commands"><button onClick={() => { setActive(1-active); focusPane(1-active); }}><kbd>Tab</kbd>Switch pane</button>
      <button onClick={() => { panes[active].up(); focusPane(active); }}><kbd>⌫</kbd>Parent folder</button></footer>
  </main>;
}
