"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sam } from "@/lib/ui/sam-component-classes";

type RuntimeHealthPayload = {
  ok?: boolean;
  error?: string;
  hint?: string;
  capabilities?: {
    pg_version?: string | null;
    pg_version_num?: number | null;
    supports_pg_cron?: boolean;
    supports_publication_column_filter?: boolean;
    supports_advanced_rpc?: boolean;
    supports_advisory_lock?: boolean;
    supports_realtime_optimization?: boolean;
    checked_at?: string | null;
  } | null;
  settings?: Record<string, unknown>;
  effective?: Record<string, unknown>;
  warnings?: { code: string; message: string }[];
};

const SETTINGS_KEYS = [
  "enable_pg_cron",
  "enable_realtime_optimization",
  "enable_delivery_realtime_filtering",
  "enable_alert_runner",
  "enable_recovery_runner",
  "enable_auto_actions",
] as const;

function toBool(v: unknown): boolean {
  return v === true;
}

export function AdminRuntimeHealthPage() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<RuntimeHealthPayload | null>(null);

  const load = useCallback(async (force?: boolean) => {
    setErr(null);
    const r = await fetch(`/api/admin/runtime-health${force ? "?force=1" : ""}`, { cache: "no-store" });
    const j = (await r.json()) as RuntimeHealthPayload;
    if (!r.ok || !j.ok) {
      setErr(j.error ?? "load_failed");
      setData(j);
      return;
    }
    setData(j);
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      await load(false);
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  const caps = data?.capabilities ?? null;
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const effective = (data?.effective ?? {}) as Record<string, unknown>;

  const rows = useMemo(() => {
    return SETTINGS_KEYS.map((k) => {
      const desired = toBool(settings[k]);
      const eff = toBool(effective[k]);
      const mismatch = desired && !eff;
      return { key: k, desired, effective: eff, mismatch };
    });
  }, [settings, effective]);

  const patchSetting = async (key: (typeof SETTINGS_KEYS)[number], next: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/runtime-health", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next }),
      });
      const j = (await r.json()) as RuntimeHealthPayload;
      if (!r.ok || !j.ok) {
        setErr(j.error ?? "save_failed");
        return;
      }
      // merge server truth
      setData((prev) => ({ ...(prev ?? {}), ...(j as any), ok: true }));
    } finally {
      setBusy(false);
    }
  };

  const titleLine = `PG Runtime Health`;
  const pgLine = caps?.pg_version
    ? `${caps.pg_version}${caps.pg_version_num ? ` (${caps.pg_version_num})` : ""}`
    : "unknown";

  return (
    <div className={`${Sam.page} bg-sam-app min-h-[70vh] px-4 py-8`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-sam-fg">{titleLine}</h1>
          <p className="mt-1 text-sm text-sam-muted">PostgreSQL capability 감지 + 운영 ON/OFF + fallback 상태.</p>
        </div>
        <button
          className={Sam.btn.secondary}
          disabled={busy || loading}
          onClick={() => void load(true)}
          type="button"
        >
          감지 새로고침
        </button>
      </div>

      <div className={`mt-6 ${Sam.card.base} ${Sam.card.pad}`}>
        <div className="text-sm text-sam-muted">PG version</div>
        <div className="mt-1 text-sam-fg font-medium">{pgLine}</div>
        {caps?.checked_at ? <div className="mt-2 text-xs text-sam-muted">checked_at: {caps.checked_at}</div> : null}
      </div>

      {loading ? (
        <div className="mt-6 text-sam-muted">불러오는 중…</div>
      ) : err ? (
        <div className={`mt-6 ${Sam.card.base} ${Sam.card.pad} border border-red-300`}>
          <div className="text-red-700 font-medium">오류</div>
          <div className="mt-2 text-sm text-red-700 break-all">{err}</div>
          {data?.hint ? <div className="mt-2 text-xs text-sam-muted">{data.hint}</div> : null}
        </div>
      ) : null}

      {data?.warnings?.length ? (
        <div className={`mt-6 ${Sam.card.base} ${Sam.card.pad} border border-amber-300`}>
          <div className="font-medium text-amber-800">Fallback / 위험 경고</div>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {data.warnings.map((w) => (
              <li key={w.code}>
                <span className="font-mono text-xs">{w.code}</span> — {w.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className={`mt-6 ${Sam.card.base} ${Sam.card.pad}`}>
        <div className="font-medium text-sam-fg">Capabilities</div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-sam-muted">pg_cron</span>{" "}
            <span className="font-medium text-sam-fg">{toBool(caps?.supports_pg_cron) ? "supported" : "no"}</span>
          </div>
          <div>
            <span className="text-sam-muted">publication column filter</span>{" "}
            <span className="font-medium text-sam-fg">
              {toBool(caps?.supports_publication_column_filter) ? "supported" : "no"}
            </span>
          </div>
          <div>
            <span className="text-sam-muted">advanced rpc</span>{" "}
            <span className="font-medium text-sam-fg">{toBool(caps?.supports_advanced_rpc) ? "supported" : "no"}</span>
          </div>
          <div>
            <span className="text-sam-muted">advisory lock</span>{" "}
            <span className="font-medium text-sam-fg">
              {toBool(caps?.supports_advisory_lock) ? "supported" : "no"}
            </span>
          </div>
          <div>
            <span className="text-sam-muted">realtime optimization</span>{" "}
            <span className="font-medium text-sam-fg">
              {toBool(caps?.supports_realtime_optimization) ? "supported" : "no"}
            </span>
          </div>
        </div>
      </div>

      <div className={`mt-6 ${Sam.card.base} ${Sam.card.pad}`}>
        <div className="font-medium text-sam-fg">Runtime settings (desired → effective)</div>
        <div className="mt-3 space-y-2">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-mono text-sm text-sam-fg">{r.key}</div>
                <div className="text-xs text-sam-muted">
                  desired: {r.desired ? "on" : "off"} · effective: {r.effective ? "on" : "off"}
                  {r.mismatch ? " · fallback" : ""}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  className={Sam.btn.secondary}
                  disabled={busy}
                  onClick={() => void patchSetting(r.key, false)}
                  type="button"
                >
                  OFF
                </button>
                <button
                  className={Sam.btn.primary}
                  disabled={busy}
                  onClick={() => void patchSetting(r.key, true)}
                  type="button"
                >
                  ON
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 text-xs text-sam-muted">
          effective는 capability 기반으로 자동 보정됩니다. (지원 안 하면 on으로 저장돼도 runtime에서는 off로 취급)
        </div>
      </div>
    </div>
  );
}

