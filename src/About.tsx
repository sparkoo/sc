import { Link } from "@radix-ui/themes";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useState } from "react";
import { version } from "../src-tauri/tauri.conf.json";

declare const __BUILD_COMMIT__: { hash: string; timestamp: string } | null;

const repository = "https://github.com/sparkoo/sc";

export function About() {
  const [openError, setOpenError] = useState(false);
  const commit = __BUILD_COMMIT__;

  return (
    <section className="about" aria-labelledby="about-title">
      <h3 id="about-title">About SC Commander</h3>
      <dl>
        <dt>Version</dt>
        <dd>{version}</dd>
        <dt>Build commit</dt>
        <dd>
          {commit ? (
            <code title={commit.hash}>{commit.hash.slice(0, 12)}</code>
          ) : "Unavailable"}
        </dd>
        {commit && (
          <>
            <dt>Commit timestamp</dt>
            <dd><time dateTime={commit.timestamp}>{commit.timestamp.replace("T", " ")}</time></dd>
          </>
        )}
        <dt>Author</dt>
        <dd>Michal Vala (sparkoo)</dd>
        <dt>Repository</dt>
        <dd>
          <Link
            href={repository}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => {
              if (!isTauri()) return;
              event.preventDefault();
              setOpenError(false);
              void invoke("open_repository").catch(() => setOpenError(true));
            }}
          >
            sparkoo/sc on GitHub
          </Link>
        </dd>
        <dt>License</dt>
        <dd>WTFPL v2</dd>
      </dl>
      {openError && <p className="error" role="alert">Could not open the GitHub repository.</p>}
    </section>
  );
}
