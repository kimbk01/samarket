"use client";

/**
 * P1 — 포인트 환급 대기 (결제 후 적용 실패 + 환급 실패). 미해결 건은 빨간색, 같은 키 환급 원장이 생기면 「해결」.
 * 조회 실패는 0건이 아니라 「확인 불가」.
 */
import { useEffect, useState } from "react";
import { AdminTechId } from "@/components/admin/ui/AdminTechId";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import type { MessageKey } from "@/lib/i18n/messages";
import { translateBy } from "@/lib/i18n/translate-by";

type Item = { id: string; userId: string; refundKey: string; note: string; createdAt: string; resolvedLedgerId: string | null };

export function AdminPointRefundPendingPanel({ ko }: { ko: boolean }) {
  const tr = (key: MessageKey, vars?: Record<string, unknown>) => translateBy(ko ? "ko" : "en", key, vars);
  const [state, setState] = useState<{ status: "loading" | "error" | "ok"; items: Item[]; unresolved: number }>({
    status: "loading",
    items: [],
    unresolved: 0,
  });
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/points/refund-pending", { credentials: "include", cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!alive) return;
        if (!ok || !j?.ok) setState({ status: "error", items: [], unresolved: 0 });
        else setState({ status: "ok", items: j.items ?? [], unresolved: Math.trunc(Number(j.unresolved) || 0) });
      })
      .catch(() => alive && setState({ status: "error", items: [], unresolved: 0 }));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-admin-point-refund-pending={state.status}>
      <h2 className="text-[16px] font-semibold text-sam-fg">
        {tr("admin_points_pending_point_refunds")}
        {state.status === "ok" ? (
          <span className={`ml-2 text-sm ${state.unresolved > 0 ? "text-sam-danger" : "text-sam-muted"}`}>
            {tr("admin_points_unresolved", { unresolved: state.unresolved })}
          </span>
        ) : null}
      </h2>
      {state.status === "loading" ? <p className="text-sm text-sam-muted">{tr("admin_loading")}</p> : null}
      {state.status === "error" ? (
        <p className="text-sm text-sam-danger">{tr("admin_points_could_not_load_pending_refunds")}</p>
      ) : null}
      {state.status === "ok" && state.items.length === 0 ? (
        <p className="text-sm text-sam-muted">{tr("admin_points_no_pending_refunds")}</p>
      ) : null}
      {state.items.length > 0 ? (
        <ul className="mt-2 space-y-1 text-sm">
          {state.items.map((i) => (
            <li key={i.id} className="rounded-ui-rect border border-sam-border-soft px-2 py-1">
              <span className={i.resolvedLedgerId ? "text-sam-muted" : "font-semibold text-sam-danger"}>
                {i.resolvedLedgerId ? tr("admin_points_resolved") : tr("admin_points_unresolved_2")}
              </span>
              {" · "}
              {formatAdminManilaDateTime(i.createdAt)} · <AdminTechId id={i.userId} /> · {i.refundKey}
              <br />
              <span className="text-sam-muted">{i.note}</span>
              {i.resolvedLedgerId ? (
                <>
                  {" · "}
                  <AdminTechId id={i.resolvedLedgerId} />
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
