import { Button, Checkbox } from "@radix-ui/themes";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";

const preference = "sc.automaticallyInstallUpdates";
const noticeMs = 10_000;

export function useUpdates(busy: boolean, blocked: boolean, refreshJobs: () => void) {
  const [automatic, setAutomatic] = useState(() => localStorage.getItem(preference) === "true");
  const allowAutomaticThisSession = useRef(automatic);
  const [version, setVersion] = useState<string | null>(null);
  const [deferred, setDeferred] = useState(false);
  const [requested, setRequested] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!isTauri()) return;
    let mounted = true;
    void invoke<string | null>("check_update").then(
      (available) => { if (mounted) setVersion(available); },
      (failure) => { if (mounted) setError(String(failure)); },
    );
    return () => { mounted = false; };
  }, []);

  const scheduled = !!version && !deferred && (requested || allowAutomaticThisSession.current) && !error;
  useEffect(() => {
    if (!scheduled || busy || blocked || installing) return;
    const timer = setTimeout(() => {
      setInstalling(true);
      void invoke<boolean>("install_update", { version }).then(
        (installed) => {
          if (installed) return;
          refreshJobs();
          setRetry((attempt) => attempt + 1);
          setInstalling(false);
        },
        (failure) => {
          setRequested(false);
          setInstalling(false);
          setError(String(failure));
        },
      );
    }, requested ? (retry ? 1000 : 0) : noticeMs);
    return () => clearTimeout(timer);
  }, [scheduled, busy, blocked, installing, requested, version, retry, refreshJobs]);

  return {
    automatic, version, error, installing, scheduled, requested,
    visible: !!version && !deferred,
    configure(enabled: boolean) {
      localStorage.setItem(preference, String(enabled));
      if (!enabled) allowAutomaticThisSession.current = false;
      setAutomatic(enabled);
    },
    install() {
      setError("");
      setRequested(true);
    },
    later() {
      setDeferred(true);
      setRequested(false);
    },
  };
}

export function UpdateDialog({
  updates, settings, close,
}: {
  updates: ReturnType<typeof useUpdates>;
  settings: boolean;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const { automatic, version, error, installing, scheduled, requested } = updates;
  let status = "";
  if (installing) status = "Installing the update. SC Commander will restart.";
  else if (scheduled && !requested)
    status = "SC Commander will install the update and restart shortly.";
  return (
    <dialog
      ref={dialog}
      className="dialog"
      aria-labelledby="update-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!installing) close();
      }}
    >
      <h2 id="update-dialog-title">{settings ? "Settings" : "SC Commander update"}</h2>
      {settings ? <h3>Updates</h3> : <p>Version {version} is available.</p>}
      <label className="update-preference">
        <Checkbox
          checked={automatic}
          disabled={installing}
          onCheckedChange={(checked) => updates.configure(checked === true)}
        />
        Automatically install future updates
      </label>
      {!settings && status && <p role="status">{status}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="dialog-actions">
        <Button variant="soft" disabled={installing} onClick={close}>
          {settings ? "Close" : "Later"}
        </Button>
        {!settings && (
          <Button disabled={installing || (requested && scheduled)} onClick={updates.install}>
            Install update
          </Button>
        )}
      </div>
    </dialog>
  );
}
