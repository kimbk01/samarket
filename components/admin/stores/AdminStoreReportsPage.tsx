"use client";

import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
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
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
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

/** 목록 조건 = 주소 (`store_id` 딥링크 · `page` · `size`). 필터 UI 는 없다 (매장 딥링크만). */
const LIST_CONFIG = { extras: ["store_id"] as const };

export function AdminStoreReportsPage() {
  const { language } = useI18n();
  const ko = language !== "en";
  const searchParams = useSearchParams();
  const lq = useAdminListQuery(LIST_CONFIG);
  const storeIdFilter = lq.query.extras.store_id.trim();
  const apiQs = lq.apiQueryString;
  const [total, setTotal] = useState(0);
  const focusRequestId = parseAdminStoreReportFocusRequestId(searchParams);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ code: string; status?: number } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(
    null
  );
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const returnToHere = storeIdFilter
    ? `/admin/store-reports?store_id=${encodeURIComponent(storeIdFilter)}`
    : "/admin/store-reports";

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/store-reports?${apiQs}`, { credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        // 실패해도 직전 목록은 지우지 않는다 (§8-5).
        setLoadError({
          code: res.status === 403 ? "forbidden" : "load_failed",
          status: res.status,
        });
        return;
      }
      setRows(json.reports ?? []);
      setTotal(Number(json.total) || 0);
    } catch {
      setLoadError({ code: "network_error" });
    } finally {
      setLoading(false);
    }
  }, [apiQs]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshKey 는 같은 조건 다시 불러오기 포함
  }, [lq.refreshKey]);

  // 딥링크 강조 신고가 지금 쪽에 없으면 그 신고가 있는 쪽으로 한 번 옮긴다 (첫 쪽 밖 신고도 강조).
  const focusPagedRef = useRef<string | null>(null);
  useEffect(() => {
    const id = focusRequestId.trim();
    if (!id || loading || loadError || focusPagedRef.current === id) return;
    if (rows.some((r) => r.id === id)) {
      focusPagedRef.current = id;
      return;
    }
    focusPagedRef.current = id;
    const qs = new URLSearchParams({ focus_position: id });
    if (storeIdFilter) qs.set("store_id", storeIdFilter);
    void fetch(`/api/admin/store-reports?${qs.toString()}`, { credentials: "include" })
      .then((res) => res.json().catch(() => null))
      .then((json: { ok?: boolean; position?: number | null } | null) => {
        if (!json?.ok || typeof json.position !== "number") return;
        const page = Math.floor(json.position / lq.query.size) + 1;
        if (page !== lq.query.page) lq.setPage(page);
      })
      .catch(() => undefined);
  }, [focusRequestId, rows, loading, loadError, storeIdFilter, lq]);

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
      level: adminActionLevel(actioned ? "approve" : "reject"),
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
      {loadError ? (
        <AdminErrorState ko={ko} code={loadError.code} httpStatus={loadError.status} onRetry={lq.refresh} />
      ) : null}
      {loading && rows.length === 0 ? (
        <AdminLoadingState ko={ko} />
      ) : rows.length === 0 ? (
        loadError ? null : <AdminEmptyState ko={ko} message={ko ? "접수된 신고가 없습니다." : "No reports."} />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface px-3">
          {/* 표준 표 (§2.8 목록) — 열: 매장·대상·상태·사유·신고자·일시·내용·처리 */}
          <table className="w-full min-w-[64rem] border-collapse text-left sam-text-body-secondary" data-admin-store-reports-table="1">
            <thead>
              <tr className="border-b border-sam-border text-left sam-text-xxs text-sam-muted">
                <th className="py-2 pr-2 font-medium">{ko ? "매장·대상" : "Store / target"}</th>
                <th className="py-2 pr-2 font-medium">{ko ? "상태" : "Status"}</th>
                <th className="py-2 pr-2 font-medium">{ko ? "신고 사유·신고자" : "Reason / reporter"}</th>
                <th className="py-2 pr-2 font-medium">{ko ? "접수 일시" : "Created"}</th>
                <th className="py-2 pr-2 font-medium">{ko ? "신고 내용" : "Message"}</th>
                <th className="py-2 pr-2 font-medium">{ko ? "처리" : "Action"}</th>
              </tr>
            </thead>
            <tbody>
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
                  <tr
                    key={r.id}
                    ref={(el) => {
                      rowRefs.current[r.id] = el;
                    }}
                    data-testid={focusRequestId === r.id ? "admin-store-report-focused" : undefined}
                    className="border-b border-sam-border/70 align-top"
                  >
                    <td className="py-2 pr-2 font-medium text-sam-fg">
                      {r.store_id ? (
                        <Link href={storeHref} className="hover:text-signature hover:underline">
                          {r.store_name || (ko ? "이름 없는 매장" : "Unnamed store")}
                        </Link>
                      ) : (
                        r.store_name || (ko ? "이름 없는 매장" : "Unnamed store")
                      )}
                      <span className="block text-[12px] font-normal text-sam-muted">
                        {r.target_type === "product"
                          ? ko
                            ? `상품 신고${r.product_title ? ` · ${r.product_title}` : ""}`
                            : `Product report${r.product_title ? ` · ${r.product_title}` : ""}`
                          : ko
                            ? "매장 신고"
                            : "Store report"}
                      </span>
                      <AdminTechDetails ko={ko}>
                        <div>report_id: {r.id}</div>
                        <div>store_id: {r.store_id || "—"}</div>
                        <div>
                          target: {r.target_type} / {r.target_id}
                        </div>
                        <div>reporter_user_id: {r.reporter_user_id}</div>
                        <div>status: {r.status}</div>
                      </AdminTechDetails>
                    </td>
                    <td className="py-2 pr-2">
                      <AdminToneBadge tone={st.tone}>{st.label}</AdminToneBadge>
                    </td>
                    <td className="py-2 pr-2 text-[12px] text-sam-muted">
                      <div>{reasonLabel(r.reason_type, ko)}</div>
                      <div>{r.reporter_label || (ko ? "이름 확인 불가" : "Name unavailable")}</div>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-2 text-[12px] text-sam-muted">
                      {formatAdminDateTime(r.created_at, language)}
                    </td>
                    <td className="max-w-[20rem] py-2 pr-2">
                      <p className="whitespace-pre-wrap text-sam-fg">{r.message}</p>
                    </td>
                    <td className="py-2 pr-2">
                      {r.status !== "open" ? (
                        <p className="text-[12px] text-sam-muted">
                          {ko ? "처리" : "Handled"}: {r.reviewed_at ? formatAdminDateTime(r.reviewed_at, language) : "—"}
                          {r.action_memo ? ` · ${r.action_memo}` : ""}
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {/* 표 행 버튼 = ghost/sm 2개 이하 — 화면 primary 는 두지 않는다 */}
                          <AdminActionButton variant="ghost" size="sm" disabled={busyId === r.id} onClick={() => void patchStatus(r, "dismissed")}>
                            {ko ? "기각" : "Dismiss"}
                          </AdminActionButton>
                          <AdminActionButton variant="ghost" size="sm" disabled={busyId === r.id} onClick={() => void patchStatus(r, "actioned")}>
                            {ko ? "조치 완료" : "Actioned"}
                          </AdminActionButton>
                        </div>
                      )}
                      {r.store_id ? (
                        <div className="mt-2 flex flex-wrap gap-3 text-[12px]">
                          <Link href={storeHref} className="text-signature hover:underline">
                            {ko ? "매장 상세" : "Store detail"}
                          </Link>
                          <Link href={reviewSuspendHref} className="text-signature hover:underline">
                            {ko ? "운영 중지 검토" : "Review suspension"}
                          </Link>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 ? (
        <AdminPagination
          ko={ko}
          page={lq.query.page}
          size={lq.query.size}
          total={total}
          onPageChange={lq.setPage}
          onSizeChange={lq.setSize}
          disabled={loading}
        />
      ) : null}
    </div>
  );
}
