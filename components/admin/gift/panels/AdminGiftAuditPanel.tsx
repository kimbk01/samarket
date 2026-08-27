"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildAdminGiftOpsHref } from "@/lib/gift-certificate/admin-gift-ops-tabs";
import { formatMoneyPhp } from "@/lib/utils/format";
import { Sam } from "@/lib/ui/css-vars";

type AuditEvent = {
  id: string;
  eventType: string;
  at: string;
  storeName: string | null;
  publicGiftNumber: string | null;
  orderId: string | null;
  userLabel: string | null;
  amount: number | null;
  summary: string;
};

function dt(v: string): string {
  try {
    return new Date(v).toLocaleString();
  } catch {
    return v;
  }
}

export function AdminGiftAuditPanel({ q: initialQ, event: initialEvent }: { q: string; event: string }) {
  const { safeT } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  const [event, setEvent] = useState(initialEvent);
  const [rows, setRows] = useState<AuditEvent[]>([]);
  const [state, setState] = useState<"loading" | "error" | "empty" | "data">("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set("q", q.trim());
      if (event.trim()) qs.set("event", event.trim());
      const res = await fetch(`/api/admin/gift-certificates/audit-events?${qs.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as { ok?: boolean; events?: AuditEvent[] };
      if (!res.ok || !json.ok) {
        setState("error");
        return;
      }
      const list = json.events ?? [];
      setRows(list);
      setState(list.length === 0 ? "empty" : "data");
    } catch {
      setState("error");
    }
  }, [event, q]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4" data-admin-gift-audit="1">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="min-w-0 flex-1 rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Store / Gift # / Order / User"
        />
        <input
          className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm sm:w-56"
          value={event}
          onChange={(e) => setEvent(e.target.value)}
          placeholder="EVENT type"
        />
        <button
          type="button"
          className={`${Sam.btn.primary} min-h-[44px]`}
          onClick={() =>
            router.push(
              buildAdminGiftOpsHref({
                tab: "audit",
                extra: { q: q.trim() || null, event: event.trim() || null },
              })
            )
          }
        >
          {safeT("gift_ops_search", { fallbackKo: "검색", fallbackEn: "Search" })}
        </button>
      </div>

      {state === "loading" ? <p className="text-sm text-sam-muted">…</p> : null}
      {state === "error" ? (
        <div className="space-y-2">
          <p className="text-sm text-red-600">
            {safeT("gift_ops_audit_error", {
              fallbackKo: "감사 이력을 불러오지 못했습니다.",
              fallbackEn: "Couldn’t load audit history.",
            })}
          </p>
          <button type="button" className={Sam.btn.secondary} onClick={() => void load()}>
            {safeT("gift_ops_retry", { fallbackKo: "다시 시도", fallbackEn: "Retry" })}
          </button>
        </div>
      ) : null}
      {state === "empty" ? (
        <p className="text-sm text-sam-muted">
          {safeT("gift_ops_audit_empty", {
            fallbackKo: "감사 이력이 없습니다.",
            fallbackEn: "No audit events.",
          })}
        </p>
      ) : null}

      {state === "data" ? (
        <ul className="space-y-2">
          {rows.map((e) => (
            <li
              key={e.id}
              className="rounded-ui-rect border border-sam-border bg-sam-surface p-3"
              data-audit-event={e.eventType}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold">{e.eventType}</p>
                <p className="text-xs text-sam-muted">{dt(e.at)}</p>
              </div>
              <p className="mt-1 text-sm">
                {e.storeName || "—"}
                {e.publicGiftNumber ? ` · ${e.publicGiftNumber}` : ""}
                {e.userLabel ? ` · ${e.userLabel}` : ""}
                {e.amount != null ? ` · ${formatMoneyPhp(e.amount)}` : ""}
              </p>
              <p className="text-xs text-sam-muted">{e.summary}</p>
              {e.orderId ? (
                <p className="text-xs text-sam-muted">Order {e.orderId.slice(0, 8)}…</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
