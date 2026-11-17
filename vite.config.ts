import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { defineConfig } from "vite";

function readCommit() {
  if (!existsSync(new URL(".git", import.meta.url))) return null;
  try {
    const [hash, date] = execFileSync("git", ["log", "-1", "--format=%H%n%cs"], {
      cwd: new URL(".", import.meta.url),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim().split(/\r?\n/);
    return { hash, date };
  } catch {
    return null;
  }
}

export default defineConfig({
  clearScreen: false,
  define: { __BUILD_COMMIT__: JSON.stringify(readCommit()) },
  server: { port: 1420, strictPort: true },
});
