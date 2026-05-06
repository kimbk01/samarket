"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Sam } from "@/lib/ui/sam-component-classes";

type GateStatus = "pass" | "warn" | "fail" | "needs_check";

type GateItem = {
  key: string;
  status: GateStatus;
  title: string;
  description: string;
  howTo: string;
  links: { label: string; href: string }[];
  checked_at?: string | null;
};

type ManualRow = {
  key: string;
  label: string;
  checked: boolean;
  checked_at: string | null;
  checked_by: string | null;
  note: string | null;
  updated_at: string | null;
};

type GatePayload = {
  ok?: boolean;
  error?: string;
  hint?: string;
  generated_at?: string;
  gate?: {
    overall?: "READY" | "WARNING" | "BLOCKED";
    items?: GateItem[];
    manual?: ManualRow[];
  };
};

function badgeClass(st: GateStatus): string {
  if (st === "pass") return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (st === "warn") return "bg-amber-100 text-amber-800 border-amber-300";
  if (st === "fail") return "bg-red-100 text-red-800 border-red-300";
  return "bg-sam-surface-muted text-sam-muted border-sam-border";
}

function overallClass(o: string | undefined): string {
  if (o === "READY") return "text-emerald-700";
  if (o === "BLOCKED") return "text-red-700";
  return "text-amber-700";
}

export function AdminDeliveryReleaseGatePage() {
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<GatePayload | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const r = await fetch("/api/admin/delivery-release-gate", { cache: "no-store" });
    const j = (await r.json()) as GatePayload;
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
      await load();
      if (alive) setLoading(false);
    })();
    const t = window.setInterval(() => {
      if (busyKey) return;
      void load();
    }, 30_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [load, busyKey]);

  const gate = data?.gate;
  const items = gate?.items ?? [];
  const manual = gate?.manual ?? [];
  const overall = gate?.overall ?? "WARNING";

  const sortedItems = useMemo(() => {
    const rank = (s: GateStatus) => (s === "fail" ? 3 : s === "warn" ? 2 : s === "needs_check" ? 1 : 0);
    return [...items].sort((a, b) => rank(b.status) - rank(a.status));
  }, [items]);

  const onToggleManual = async (key: string, checked: boolean, note: string | null) => {
    if (busyKey) return;
    setBusyKey(key);
    setErr(null);
    try {
      const r = await fetch("/api/admin/delivery-release-gate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, checked, note }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "save_failed");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className={`${Sam.page} bg-sam-app min-h-[75vh] px-4 py-8`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-sam-fg">Delivery Release Gate</h1>
          <p className="mt-1 text-sm text-sam-muted">
            자동 검사 + 수동 체크 기록 기반으로 출시 가능 여부를 계산합니다. (auto refresh 30s)
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/admin/ops-console" className={Sam.btn.secondary}>
            Ops Console
          </Link>
          <Link href="/admin/runtime-health" className={Sam.btn.secondary}>
            Runtime Health
          </Link>
          <button className={Sam.btn.secondary} onClick={() => void load()} disabled={!!busyKey} type="button">
            새로고침
          </button>
        </div>
      </div>

      <div className={`mt-6 ${Sam.card.base} ${Sam.card.pad}`}>
        <div className="text-sm text-sam-muted">Overall</div>
        <div className={`mt-1 text-2xl font-semibold ${overallClass(overall)}`}>{overall}</div>
        <div className="mt-2 text-xs text-sam-muted">generated_at: {data?.generated_at ?? "—"}</div>
      </div>

      {loading ? <div className="mt-6 text-sam-muted">불러오는 중…</div> : null}
      {err ? (
        <div className={`mt-6 ${Sam.card.base} ${Sam.card.pad} border border-red-300`}>
          <div className="font-medium text-red-700">오류</div>
          <div className="mt-2 text-sm text-red-700 break-all">{err}</div>
          {data?.hint ? <div className="mt-2 text-xs text-sam-muted">{data.hint}</div> : null}
        </div>
      ) : null}

      <div className={`mt-6 ${Sam.card.base} ${Sam.card.pad}`}>
        <div className="font-medium text-sam-fg">자동 검사</div>
        <div className="mt-3 space-y-3">
          {sortedItems.length === 0 ? (
            <div className="text-sam-muted text-sm">항목이 없습니다.</div>
          ) : (
            sortedItems.map((it) => (
              <div key={it.key} className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-sam-fg">{it.title}</div>
                    <div className="mt-1 text-xs text-sam-muted break-all">{it.description}</div>
                    <div className="mt-1 text-xs text-sam-muted">how: {it.howTo}</div>
                    {it.checked_at ? <div className="mt-1 text-xs text-sam-muted">checked_at: {it.checked_at}</div> : null}
                  </div>
                  <div className={`shrink-0 rounded-ui-rect border px-2 py-1 text-xs font-mono ${badgeClass(it.status)}`}>
                    {it.status}
                  </div>
                </div>
                {it.links?.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {it.links.map((l) => (
                      <Link key={l.href + l.label} href={l.href} className={Sam.btn.secondary}>
                        {l.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>

      <div className={`mt-6 ${Sam.card.base} ${Sam.card.pad}`}>
        <div className="font-medium text-sam-fg">수동 체크(기록)</div>
        <div className="mt-3 space-y-3">
          {manual.length === 0 ? (
            <div className="text-sam-muted text-sm">
              수동 체크 테이블이 없거나(마이그레이션 미적용), 항목이 없습니다.
            </div>
          ) : (
            manual.map((m) => (
              <div key={m.key} className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm text-sam-fg">
                    <input
                      type="checkbox"
                      checked={m.checked}
                      disabled={busyKey === m.key}
                      onChange={(e) => void onToggleManual(m.key, e.target.checked, m.note)}
                    />
                    {m.label}
                  </label>
                  <div className="text-xs text-sam-muted">
                    {m.checked_at ? `checked_at: ${m.checked_at}` : "미확인"}
                  </div>
                </div>
                <div className="mt-2">
                  <input
                    className="w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-sm"
                    placeholder="메모(선택)"
                    defaultValue={m.note ?? ""}
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      if (next === (m.note ?? "")) return;
                      void onToggleManual(m.key, m.checked, next || null);
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

