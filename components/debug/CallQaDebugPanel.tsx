"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearDibayCallQaLogs,
  exportDibayCallQaLogsText,
  getDibayCallQaLogs,
  type DibayCallQaLogEntry,
} from "@/lib/call/qa/dibay-call-qa-log";
import { Sam } from "@/lib/ui/sam-component-classes";

const POLL_MS = 2_000;

export function CallQaDebugPanel() {
  const [entries, setEntries] = useState<DibayCallQaLogEntry[]>([]);
  const [filterCallId, setFilterCallId] = useState("");
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(() => {
    setEntries(getDibayCallQaLogs());
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = filterCallId.trim();
    if (!q) return entries;
    return entries.filter((e) => e.callId?.includes(q));
  }, [entries, filterCallId]);

  const callIds = useMemo(() => {
    const ids = new Set<string>();
    for (const e of entries) {
      if (e.callId) ids.add(e.callId);
    }
    return [...ids].slice(-10).reverse();
  }, [entries]);

  const onCopy = async () => {
    const text = exportDibayCallQaLogsText();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      /* fallback textarea */
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 pb-24">
      <header className="flex flex-col gap-2">
        <h1 className="text-lg font-semibold text-sam-fg">P4 Call QA Log</h1>
        <p className="text-sm text-sam-fg-muted">
          Device B (no USB logcat): copy logs after each scenario. Also available via{" "}
          <code className="text-xs">window.__dibayCallQaLogs.exportText()</code>
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={Sam.btn.primary} onClick={onCopy}>
          {copied ? "Copied" : "Copy all logs"}
        </button>
        <button
          type="button"
          className={Sam.btn.secondary}
          onClick={() => {
            clearDibayCallQaLogs();
            refresh();
          }}
        >
          Clear
        </button>
        <button type="button" className={Sam.btn.secondary} onClick={refresh}>
          Refresh
        </button>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-sam-fg-muted">Filter by callId</span>
        <input
          className={Sam.input.base}
          value={filterCallId}
          onChange={(e) => setFilterCallId(e.target.value)}
          placeholder="paste callId"
          list="p4-call-ids"
        />
        <datalist id="p4-call-ids">
          {callIds.map((id) => (
            <option key={id} value={id} />
          ))}
        </datalist>
      </label>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface overflow-hidden">
        <div className="max-h-[60vh] overflow-y-auto p-2 font-mono text-xs leading-relaxed">
          {filtered.length === 0 ? (
            <p className="text-sam-fg-muted p-2">No QA logs yet. Start a call on this device.</p>
          ) : (
            filtered
              .slice()
              .reverse()
              .map((e, i) => (
                <div key={`${e.at}-${e.step}-${i}`} className="border-b border-sam-border/50 py-1 last:border-0">
                  <span className="text-sam-fg-muted">{new Date(e.at).toISOString()} </span>
                  <span className="text-sam-fg font-medium">{e.step}</span>
                  {e.callId ? <span className="text-sam-fg-muted"> callId={e.callId}</span> : null}
                  {e.phase ? <span className="text-sam-fg-muted"> phase={e.phase}</span> : null}
                  {e.cleanupReason ? (
                    <span className="text-sam-fg-muted"> cleanup={e.cleanupReason}</span>
                  ) : null}
                  {e.reason ? <span className="text-sam-fg-muted"> reason={e.reason}</span> : null}
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}
