import { Button, Kbd } from "@radix-ui/themes";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useBrowser } from "./browser";
import { focusPane, Pane } from "./Pane";
import {
  commands,
  JobPanel,
  OperationDialog,
  prepare,
  useJobs,
  type Action,
  type Prompt,
} from "./Operations";
import { Icon } from "./Icons";

export function App() {
  const left = useBrowser(0),
    right = useBrowser(1);
  const panes = [left, right];
  const [active, setActive] = useState(0);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const queue = useJobs(() => {
    if (!left.loading) left.refresh();
    if (!right.loading) right.refresh();
  });
  function begin(action: Action, side = active) {
    setActive(side);
    const request = prepare(action, panes[side], panes[1 - side]);
    if (request) setPrompt(request);
  }
  useEffect(() => {
    function shortcuts(event: KeyboardEvent) {
      if (
        prompt ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey
      )
        return;
      const pane =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(".pane")
          : null;
      const side = pane ? Number(pane.dataset.side) : active;
      if (event.key === "Tab") {
        event.preventDefault();
        setActive(1 - side);
        focusPane(1 - side);
        return;
      }
      if (event.shiftKey || event.target instanceof HTMLInputElement) return;
      const command = commands.find((c) => c.key === event.key);
      if (command) {
        event.preventDefault();
        begin(command.action, side);
      }
    }
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  });
  useEffect(() => {
    focusPane(0);
  }, []);
  useEffect(() => {
    if (!left.loading && !right.loading && left.folder && right.folder)
      void invoke("frontend_ready");
  }, [left.loading, right.loading, left.folder, right.folder]);
  return (
    <main className="shell">
      <div className="panes">
        {panes.map((pane, side) => (
          <Pane
            key={side}
            pane={pane}
            side={side}
            active={active === side}
            activate={() => setActive(side)}
          />
        ))}
      </div>
      <JobPanel queue={queue} />
      <footer className="commands">
        {commands.map((c) => {
          const pane = panes[active];
          const count =
            pane.marked.size ||
            (pane.cursor && pane.cursor !== pane.folder?.parent ? 1 : 0);
          const disabled =
            !pane.folder?.actions.includes(c.action) ||
            pane.loading ||
            (c.action === "rename" && count !== 1) ||
            (c.action !== "newFolder" && count === 0) ||
            (["move", "copy"].includes(c.action) &&
              (!panes[1 - active].folder || panes[1 - active].loading));
          return (
            <Button
              size="1"
              variant="soft"
              key={c.key}
              disabled={disabled}
              onClick={() => begin(c.action)}
            >
              <Kbd>{c.key}</Kbd>
              {c.label}
            </Button>
          );
        })}
        <Button
          size="1"
          variant="soft"
          className="switch"
          onClick={() => {
            setActive(1 - active);
            focusPane(1 - active);
          }}
        >
          <Kbd>Tab</Kbd>Switch pane
        </Button>
        <Button
          size="1"
          variant="soft"
          className="jobs-button"
          aria-expanded={queue.visible}
          onClick={() => queue.setVisible(!queue.visible)}
        >
          <Icon name="activity" />
          Operations {queue.jobs.length || ""}
        </Button>
      </footer>
      {prompt && (
        <OperationDialog
          prompt={prompt}
          close={() => {
            setPrompt(null);
            requestAnimationFrame(() => focusPane(active));
          }}
          submitted={() => {
            queue.setVisible(true);
            queue.update();
          }}
        />
      )}
    </main>
  );
}
