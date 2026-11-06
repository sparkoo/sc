async function run(paths) {
  const delay = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));
  const panes = [...document.querySelectorAll(".pane")];
  const list = side => panes[side].querySelector(".files");
  const input = side => panes[side].querySelector(".location input");
  const row = (side, name) => [...panes[side].querySelectorAll(".file-name")].find(el => el.textContent === name);
  const done = side => !panes[side].querySelector(".pane-status").textContent.includes("Reading");
  const metrics = {};
  let step = "startup";
  async function until(predicate, description) {
    const start = performance.now();
    while (!predicate()) {
      if (performance.now() - start > 45000) throw new Error("Timed out: " + description);
      await delay();
    }
  }
  function key(el, value) { el.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })); }
  async function setInput(el, value) {
    el.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value);
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
      if (panes[side].querySelector(".cursor .file-name")?.textContent === name) return;
      key(el, "ArrowDown");
      await delay();
    }
    throw new Error("Could not focus " + name);
  }
  async function command(side, shortcut, name) {
    key(list(side), shortcut);
    await until(() => document.querySelector("dialog[open]"), "confirmation for " + shortcut);
    const form = document.querySelector("dialog form");
    if (name) await setInput(form.querySelector("input"), name);
    form.requestSubmit();
    await until(() => !document.querySelector("dialog"), "dismiss confirmation");
  }
  async function job(n) {
    await until(() => {
      const jobs = document.querySelectorAll(".job-summary");
      if (jobs.length !== n) return false;
      if (jobs[0].textContent.includes("failed")) throw new Error(jobs[0].parentElement.textContent);
      return jobs[0].textContent.includes("finished") && done(0) && done(1);
    }, "finished job " + n);
    await delay(150);
  }
  let result;
  try {
    step = "navigate both panes";
    await navigate(0, paths.source);
    await until(() => row(0, "alpha.txt") && done(0), step);
    await navigate(1, paths.target);
    await until(() => done(1) && panes[1].querySelector(".empty")?.textContent === "Empty folder", step);
    step = "open and leave a subfolder";
    await select(0, "nested");
    key(list(0), "Enter");
    await until(() => input(0).value.endsWith("nested") && done(0), step);
    key(list(0), "Backspace");
    await until(() => row(0, "alpha.txt") && done(0) && panes[0].querySelector(".cursor .file-name")?.textContent === "nested", "restored focus");
    step = "mark and switch panes";
    await select(0, "alpha.txt");
    key(list(0), " ");
    key(list(0), "Tab");
    if (document.activeElement !== list(1)) throw new Error("Tab lost focus");
    key(list(1), "Tab");
    await until(() => panes[0].querySelector(".marked .file-name")?.textContent === "alpha.txt", step);
    step = "copy";
    await command(0, "F5");
    await job(1);
    await until(() => row(1, "alpha.txt"), "copied file");
    step = "keep both";
    await select(0, "alpha.txt");
    await command(0, "F5");
    await until(() => document.querySelector(".conflict"), "file collision");
    [...document.querySelectorAll(".conflict button")].find(b => b.textContent === "Keep both").click();
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
    if (document.activeElement !== list(1)) throw new Error("Could not switch during enumeration");
    await until(() => [...panes[0].querySelectorAll(".file-name")].some(el => /^\d+$/.test(el.textContent)), "first large-directory rows");
    metrics.firstVisibleMs = Math.round(performance.now() - start);
    await until(() => done(0) && panes[0].querySelector(".pane-status").textContent.includes(paths.count.toLocaleString()), "full directory");
    metrics.entries = paths.count;
    metrics.completeMs = Math.round(performance.now() - start);
    result = { ok: true, ...metrics };
  } catch (err) {
    result = { ok: false, step, error: String(err), screen: document.body.innerText.slice(-1800) };
  }
  await window.__TAURI_INTERNALS__.invoke("frontend_ready", { report: result });
}
