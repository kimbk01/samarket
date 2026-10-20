"use client";

import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { businessCcBackToStoreHref } from "@/lib/admin-business/business-control-center-links";
import { parseAdminStoreReportFocusRequestId } from "@/lib/admin/admin-ops-deeplink";
import { withAdminReturnTo } from "@/lib/admin/admin-operation-return-context";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminStatusLabel } from "@/lib/admin/status-labels/delivery-status-labels";
import { formatAdminDateTime } from "@/components/admin/i18n/admin-date-locale";

type Row = {
  id: string;
  reporter_user_id: string;
  reporter_label?: string | null;
  target_type: string;
  target_id: string;
  store_id: string;
  store_name: string;
  product_title: string | null;
  reason_type: string;
  message: string;
  status: string;
  action_type: string | null;
  action_memo: string | null;
  reviewed_at: string | null;
  created_at: string;
};

const REASON_LABELS: Record<string, [string, string]> = {
  spam: ["스팸·광고", "Spam"],
  fraud: ["사기 의심", "Suspected fraud"],
  illegal: ["불법 상품·영업", "Illegal goods or business"],
  harassment: ["욕설·괴롭힘", "Harassment"],
  misleading: ["허위·과장 정보", "Misleading info"],
  other: ["기타", "Other"],
};

function reasonLabel(raw: string, ko: boolean): string {
  const hit = REASON_LABELS[String(raw ?? "").trim()];
  return hit ? (ko ? hit[0] : hit[1]) : ko ? "기타" : "Other";
}

export function AdminStoreReportsPage() {
  const { language } = useI18n();
  const ko = language !== "en";
  const searchParams = useSearchParams();
  const storeIdFilter = (searchParams.get("store_id") ?? "").trim();
  const focusRequestId = parseAdminStoreReportFocusRequestId(searchParams);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ code: string; status?: number } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(
    null
  );
  const rowRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const returnToHere = storeIdFilter
    ? `/admin/store-reports?store_id=${encodeURIComponent(storeIdFilter)}`
    : "/admin/store-reports";

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const qs = storeIdFilter ? `?store_id=${encodeURIComponent(storeIdFilter)}` : "";
      const res = await fetch(`/api/admin/store-reports${qs}`, { credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setLoadError({
          code: res.status === 403 ? "forbidden" : "load_failed",
          status: res.status,
        });
        setRows([]);
        return;
      }
      setRows(json.reports ?? []);
    } catch {
      setLoadError({ code: "network_error" });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [storeIdFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = focusRequestId.trim();
    if (!id) return;
    const el = rowRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-sam-warning");
      const timeoutId = window.setTimeout(() => {
        el.classList.remove("ring-2", "ring-sam-warning");
      }, 2500);
      return () => window.clearTimeout(timeoutId);
    }
  }, [focusRequestId, rows]);

  /** 조치 완료 / 기각 — L2 (사유 = action_memo). 매장 자동 중지 없음: 중지는 매장 상세에서 별도 결정. */
  async function patchStatus(r: Row, status: "dismissed" | "actioned") {
    const actioned = status === "actioned";
    const confirmed = await confirmAdminAction({
      level: "L2",
      ko,
      title: actioned
        ? ko
          ? "이 신고를 조치 완료로 처리할까요?"
          : "Mark this report as actioned?"
        : ko
          ? "이 신고를 기각할까요?"
          : "Dismiss this report?",
      description: actioned
        ? ko
          ? "신고 처리 상태만 바뀝니다. 매장 운영 중지가 필요하면 「운영 중지 검토」에서 따로 처리하세요."
          : "Only the report status changes. Suspend the store separately via “Review suspension”."
        : undefined,
      confirmLabel: actioned ? (ko ? "조치 완료" : "Actioned") : ko ? "기각" : "Dismiss",
      destructive: !actioned,
    });
    if (!confirmed.ok) return;
    setBusyId(r.id);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/store-reports/${encodeURIComponent(r.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          action_memo: confirmed.reason,
          action_type: actioned ? "action" : "dismiss",
        }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        const code =
          res.status === 409 || json?.error === "not_open_or_missing"
            ? "status_changed"
            : res.status === 403
              ? typeof json?.error === "string" && json.error.startsWith("forbidden")
                ? json.error
                : "forbidden"
              : json?.error === "reason_required"
                ? "reason_required"
                : "action_failed";
        setResult({ ok: false, code });
        if (code === "status_changed") await load();
        return;
      }
      setResult({
        ok: true,
        message: actioned
          ? ko
            ? "신고를 조치 완료로 처리했습니다."
            : "Report marked as actioned."
          : ko
            ? "신고를 기각했습니다."
            : "Report dismissed.",
      });
      await load();
    } catch {
      setResult({ ok: false, code: "network_error" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader title={ko ? "매장 신고" : "Store reports"} />
      <p className="sam-text-body-secondary text-sam-muted">
        {ko
          ? "고객이 접수한 매장·상품 신고를 검토하고 조치 완료 또는 기각으로 처리합니다. 매장 운영 중지는 매장 상세에서 따로 결정합니다."
          : "Review store and product reports and mark them actioned or dismissed. Store suspension is decided separately on the store detail."}
      </p>
      {storeIdFilter ? (
        <p className="sam-text-helper text-sam-muted">
          {ko ? "특정 매장 신고만 보는 중" : "Filtered to one store"}{" "}
          <Link href={businessCcBackToStoreHref(storeIdFilter)} className="text-signature hover:underline">
            {ko ? "매장 상세로" : "Back to store"}
          </Link>
          {" · "}
          <Link href="/admin/store-reports" className="text-signature hover:underline">
            {ko ? "전체 신고 보기" : "Show all reports"}
          </Link>
        </p>
      ) : null}
      <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} />
      {loading ? (
        <AdminLoadingState ko={ko} />
      ) : loadError ? (
        <AdminErrorState ko={ko} code={loadError.code} httpStatus={loadError.status} onRetry={() => void load()} />
      ) : rows.length === 0 ? (
        <AdminEmptyState ko={ko} message={ko ? "접수된 신고가 없습니다." : "No reports."} />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const st = adminStatusLabel("report", r.status, ko);
            const storeHref = withAdminReturnTo(
              `${businessCcBackToStoreHref(r.store_id)}?tab=reports`,
              returnToHere
            );
            const reviewSuspendHref = withAdminReturnTo(
              `${businessCcBackToStoreHref(r.store_id)}?tab=basic`,
              returnToHere
            );
            return (
              <li
                key={r.id}
                ref={(el) => {
                  rowRefs.current[r.id] = el;
                }}
                data-testid={focusRequestId === r.id ? "admin-store-report-focused" : undefined}
                className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium text-sam-fg">
                    {r.store_id ? (
                      <Link href={storeHref} className="hover:text-signature hover:underline">
                        {r.store_name || (ko ? "이름 없는 매장" : "Unnamed store")}
                      </Link>
                    ) : (
                      r.store_name || (ko ? "이름 없는 매장" : "Unnamed store")
                    )}
                    <span className="block text-xs font-normal text-sam-muted">
                      {r.target_type === "product"
                        ? ko
                          ? `상품 신고${r.product_title ? ` · ${r.product_title}` : ""}`
                          : `Product report${r.product_title ? ` · ${r.product_title}` : ""}`
                        : ko
                          ? "매장 신고"
                          : "Store report"}
                    </span>
                  </span>
                  <AdminToneBadge tone={st.tone}>{st.label}</AdminToneBadge>
                </div>
                <p className="mt-1 text-xs text-sam-muted">
                  {ko ? "신고 사유" : "Reason"}: {reasonLabel(r.reason_type, ko)}
                  {" · "}
                  {ko ? "신고자" : "Reporter"}: {r.reporter_label || (ko ? "이름 확인 불가" : "Name unavailable")}
                  {" · "}
                  {formatAdminDateTime(r.created_at, language)}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-sam-fg">{r.message}</p>
                {r.status !== "open" ? (
                  <p className="mt-2 text-xs text-sam-muted">
                    {ko ? "처리" : "Handled"}: {r.reviewed_at ? formatAdminDateTime(r.reviewed_at, language) : "—"}
                    {r.action_memo ? ` · ${r.action_memo}` : ""}
                  </p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <AdminActionButton variant="secondary" size="sm" disabled={busyId === r.id} onClick={() => void patchStatus(r, "dismissed")}>
                      {ko ? "기각" : "Dismiss"}
                    </AdminActionButton>
                    <AdminActionButton variant="primary" size="sm" disabled={busyId === r.id} onClick={() => void patchStatus(r, "actioned")}>
                      {ko ? "조치 완료" : "Actioned"}
                    </AdminActionButton>
                  </div>
                )}
                {r.store_id ? (
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    <Link href={storeHref} className="text-signature hover:underline">
                      {ko ? "매장 상세" : "Store detail"}
                    </Link>
                    <Link href={reviewSuspendHref} className="text-signature hover:underline">
                      {ko ? "운영 중지 검토" : "Review suspension"}
                    </Link>
                  </div>
                ) : null}
                <AdminTechDetails ko={ko}>
                  <div>report_id: {r.id}</div>
                  <div>store_id: {r.store_id || "—"}</div>
                  <div>
                    target: {r.target_type} / {r.target_id}
                  </div>
                  <div>reporter_user_id: {r.reporter_user_id}</div>
                  <div>status: {r.status}</div>
                </AdminTechDetails>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
