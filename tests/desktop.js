async function run(paths) {
  const delay = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
  const panes = [...document.querySelectorAll(".pane")];
  const list = (side) => panes[side].querySelector(".files");
  const input = (side) => panes[side].querySelector(".location input");
  const row = (side, name) =>
    [...panes[side].querySelectorAll(".file-name")].find(
      (el) => el.textContent === name,
    );
  const done = (side) =>
    !panes[side].querySelector(".pane-status").textContent.includes("Reading");
  const metrics = {};
  const nativeInvoke = window.__TAURI_INTERNALS__.invoke;
  let step = "startup";
  async function until(predicate, description) {
    const start = performance.now();
    while (!predicate()) {
      if (performance.now() - start > 45000)
        throw new Error("Timed out: " + description);
      await delay();
    }
  }
  function key(el, value, modifiers = {}) {
    return el.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: value,
        bubbles: true,
        cancelable: true,
        ...modifiers,
      }),
    );
  }
  async function setInput(el, value) {
    el.focus();
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    await delay();
  }
  async function navigate(side, path) {
    await setInput(input(side), path);
    panes[side].querySelector("form").requestSubmit();
  }
  async function select(side, name) {
    const el = list(side);
    el.focus();
    key(el, "Home");
    await delay();
    for (let i = 0; i < 12; i++) {
      if (panes[side].querySelector(".cursor .file-name")?.textContent === name)
        return;
      key(el, "ArrowDown");
      await delay();
    }
    throw new Error("Could not focus " + name);
  }
  async function command(side, shortcut, name) {
    key(list(side), shortcut);
    await until(
      () => document.querySelector("dialog[open]"),
      "confirmation for " + shortcut,
    );
    const form = document.querySelector("dialog form");
    const control = form.querySelector("input, button");
    control.focus();
    if (!key(control, "Tab") || document.activeElement !== control)
      throw new Error("Pane switching intercepted dialog Tab");
    if (name) await setInput(form.querySelector("input"), name);
    form.requestSubmit();
    await until(
      () => !document.querySelector("dialog"),
      "dismiss confirmation",
    );
  }
  async function job(n) {
    await until(() => {
      const jobs = document.querySelectorAll(".job-summary");
      if (jobs.length !== n) return false;
      if (jobs[0].textContent.includes("failed"))
        throw new Error(jobs[0].parentElement.textContent);
      return jobs[0].textContent.includes("finished") && done(0) && done(1);
    }, "finished job " + n);
    await delay(150);
  }
  let result;
  try {
    step = "quick select native places";
    const places = await window.__TAURI_INTERNALS__.invoke("quick_places");
    const home = places.find((place) => place.name === "Home");
    if (!home || !places.length) throw new Error("Missing native places");
    // Simulate native label queries that never return; all navigation must still work.
    window.__TAURI_INTERNALS__.invoke = (...args) =>
      args[0] === "quick_place_label" ? new Promise(() => {}) : nativeInvoke(...args);
    for (const side of [0, 1]) {
      const trigger = panes[side].querySelector(".quick-places");
      trigger.focus();
      key(trigger, "Enter");
      await until(() => document.querySelector('[role="menuitem"]')?.title === home.path, "open places by trigger");
      for (const other of [1 - side, side]) {
        const next = panes[other].querySelector(".quick-places");
        next.dispatchEvent(new PointerEvent("pointerdown", {
          button: 0, ctrlKey: false, pointerType: "mouse", bubbles: true, cancelable: true,
        }));
        await delay(150);
        if (next.getAttribute("aria-expanded") !== "true" ||
            document.querySelector('[role="menu"]')?.getAttribute("aria-labelledby") !== next.id)
          throw new Error("Switching triggers dismissed the new menu");
      }
      key(document.querySelector('[role="menu"]'), "Escape");
      await until(() => !document.querySelector('[role="menu"]'), "close switched menu");
      await navigate(side, paths.source);
      await until(() => row(side, "alpha.txt") && done(side), "fixture before quick select");
      list(side).focus();
      key(list(side), "F4");
      await until(() => document.querySelector('[role="menuitem"]')?.textContent.includes("Home"), step);
      for (const place of places) {
        if (![...document.querySelectorAll('[role="menuitem"]')].some((item) => item.title === place.path))
          throw new Error("Missing place " + place.path);
      }
      const homeItem = [...document.querySelectorAll('[role="menuitem"]')].find((item) => item.title === home.path);
      homeItem.focus();
      key(homeItem, "Enter");
      await until(() => !document.querySelector('[role="menu"]') && done(side) && input(side).value === paths.home && document.activeElement === list(side), "quick select Home and focus");
      key(list(side), "F4");
      await until(() => document.querySelector('[role="menu"]'), "reopen places");
      key(document.querySelector('[role="menu"]'), "Escape");
      await until(() => !document.querySelector('[role="menu"]') && document.activeElement === list(side), "dismiss places");
      key(list(side), "F4");
      await until(() => document.querySelector('[role="menu"]'), "reopen places for Tab");
      key(document.querySelector('[role="menu"]'), "Tab", { shiftKey: Boolean(side) });
      await until(() => !document.querySelector('[role="menu"]') && document.activeElement === list(1-side), "switch panes from places");
    }
    window.__TAURI_INTERNALS__.invoke = nativeInvoke;
    step = "navigate both panes";
    await navigate(0, paths.source);
    await until(() => row(0, "alpha.txt") && done(0), step);
    await navigate(1, paths.target);
    await until(
      () =>
        done(1) &&
        panes[1].querySelector(".empty")?.textContent === "Empty folder",
      step,
    );
    step = "hidden entries toggle";
    const hiddenToggle = [...document.querySelectorAll(".commands button")].find(
      (button) => button.textContent.endsWith("Show hidden"),
    );
    const hiddenNames = [".dot-file", ".dot-folder", "native-hidden-file", "native-hidden-folder",
      ".native-hidden-file", ".native-hidden-folder"];
    if (!hiddenToggle || hiddenToggle.getAttribute("aria-pressed") !== "false" || hiddenNames.some((name) => row(0, name)))
      throw new Error("Hidden entries visible by default");
    const hiddenModifiers = /Mac/i.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true };
    input(0).focus();
    if (key(input(0), "h", hiddenModifiers)) throw new Error("Hidden shortcut was not handled");
    await until(() => row(0, ".dot-file") && row(0, ".dot-folder"), "show dot entries by shortcut");
    if (document.activeElement !== input(0)) throw new Error("Shortcut stole location focus");
    key(input(0), "h", { ...hiddenModifiers, repeat: true });
    await delay();
    if (!row(0, ".dot-file")) throw new Error("Repeated key toggled hidden entries");
    if (!row(0, "native-hidden-file") && !row(0, ".native-hidden-file"))
      throw new Error("Native hidden file missing");
    await select(0, ".dot-file");
    key(list(0), " ");
    await delay();
    key(list(0), "h", hiddenModifiers);
    await until(() => !hiddenNames.some((name) => row(0, name)), "hide entries by shortcut");
    hiddenToggle.click();
    await until(() => row(0, ".dot-file"), "show entries again");
    if (panes[0].querySelector(".marked")) throw new Error("Invisible mark was retained");
    hiddenToggle.click();
    await delay();
    step = "open and leave a subfolder";
    await select(0, "nested");
    key(list(0), "Enter");
    await until(() => input(0).value.endsWith("nested") && done(0), step);
    await select(0, "..");
    key(list(0), " ");
    await delay();
    if (panes[0].querySelector(".marked"))
      throw new Error("Parent row was marked");
    await select(0, "..");
    key(list(0), "F8");
    await delay();
    if (document.querySelector("dialog"))
      throw new Error("Parent row allowed a file operation");
    key(list(0), "Enter");
    await until(
      () =>
        row(0, "alpha.txt") &&
        done(0) &&
        panes[0].querySelector(".cursor .file-name")?.textContent === "nested",
      "restored focus",
    );
    step = "double-click parent row";
    await select(0, "nested");
    key(list(0), "Enter");
    await until(() => input(0).value.endsWith("nested") && done(0), step);
    row(0, "..").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await until(
      () => row(0, "alpha.txt") && done(0) &&
        panes[0].querySelector(".cursor .file-name")?.textContent === "nested",
      step,
    );
    step = "mark and switch panes";
    await select(0, "alpha.txt");
    key(list(0), " ");
    key(list(0), "Tab");
    if (document.activeElement !== list(1)) throw new Error("Tab lost focus");
    key(list(1), "Tab");
    await until(
      () =>
        panes[0].querySelector(".marked .file-name")?.textContent ===
        "alpha.txt",
      step,
    );
    step = "switch panes from outside the file lists";
    for (const control of [
      document.querySelector(".jobs-button"),
      document.querySelector(".commands .switch"),
      document.querySelector(".commands"),
      input(0),
      panes[0].querySelector(".columns button"),
    ]) {
      list(0).focus();
      await delay();
      control.focus();
      if (key(control, "Tab") || document.activeElement !== list(1))
        throw new Error("Tab did not switch panes from " + control.outerHTML);
      await delay();
      if (key(list(1), "Tab", { shiftKey: true }) || document.activeElement !== list(0))
        throw new Error("Shift+Tab did not switch back");
    }
    step = "copy";
    await command(0, "F5");
    await job(1);
    await until(() => row(1, "alpha.txt"), "copied file");
    step = "keep both";
    await select(0, "alpha.txt");
    await command(0, "F5");
    await until(() => document.querySelector(".conflict"), "file collision");
    [...document.querySelectorAll(".conflict button")]
      .find((b) => b.textContent === "Keep both")
      .click();
    await job(2);
    await until(() => row(1, "alpha (2).txt"), step);
    step = "rename";
    await select(1, "alpha (2).txt");
    await command(1, "F2", "renamed.txt");
    await job(3);
    await until(() => row(1, "renamed.txt"), step);
    step = "system trash";
    await select(1, "renamed.txt");
    await command(1, "F8");
    await job(4);
    step = "new folder";
    await command(1, "F7", "created");
    await job(5);
    step = "move";
    await select(0, "beta.txt");
    await command(0, "F6");
    await job(6);
    await until(() => row(1, "beta.txt"), step);
    step = "large folder";
    list(0).focus();
    await setInput(input(0), paths.large);
    const start = performance.now();
    panes[0].querySelector("form").requestSubmit();
    key(list(0), "Tab");
    if (document.activeElement !== list(1))
      throw new Error("Could not switch during enumeration");
    await until(
      () =>
        [...panes[0].querySelectorAll(".file-name")].some((el) =>
          /^\d+$/.test(el.textContent),
        ),
      "first large-directory rows",
    );
    metrics.firstVisibleMs = Math.round(performance.now() - start);
    await until(
      () =>
        done(0) &&
        panes[0]
          .querySelector(".pane-status")
          .textContent.includes(paths.count.toLocaleString()),
      "full directory",
    );
    metrics.entries = paths.count;
    metrics.completeMs = Math.round(performance.now() - start);
    result = { ok: true, ...metrics };
  } catch (err) {
    result = {
      ok: false,
      step,
      error: String(err),
      screen: document.body.innerText.slice(-1800),
      focus: document.activeElement?.outerHTML.slice(0, 1200),
      triggers: [...document.querySelectorAll(".quick-places")].map((el) => el.outerHTML),
    };
  }
  window.__TAURI_INTERNALS__.invoke = nativeInvoke;
  await nativeInvoke("frontend_ready", { report: result });
}
