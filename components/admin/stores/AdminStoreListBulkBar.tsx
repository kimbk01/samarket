"use client";

/**
 * 3-C L-10·B-2·B-3 — 관리자 매장 목록 일괄 바 (회원 관리 `AdminMemberListBulkBar` 패턴).
 * 5-A — 「매장 운영」(`/admin/business`) 목록에 장착 (입점 심사 화면에서는 제거).
 * 일괄 = L3(사유 + 대상 수 재입력). 서버 `/api/admin/stores/bulk` 가 매장마다 단건 PATCH 와 같은 함수로 처리하고
 * 매장별 성공/실패를 돌려준다. 공통 수정은 노출·영업 중 여부·영업시간·배달 반경·추천 매장(HS-07)만.
 */
import { useRef, useState } from "react";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminTechId, formatAdminShortId } from "@/components/admin/ui/AdminTechId";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import type { AdminStoreBulkAction, AdminStoreBulkResult } from "@/lib/admin-business/admin-store-bulk";
import { manilaDateInputToIso } from "@/lib/admin-business/admin-store-featured";
import { adminStoreVisibilityLockConfirmCopy } from "@/lib/admin-business/admin-store-visibility-lock-copy";

const PREVIEW_MAX = 8;

export type AdminStoreBulkRowLite = { id: string; store_name: string | null };

function actionLabel(action: AdminStoreBulkAction, value: unknown, ko: boolean): string {
  switch (action) {
    case "set_store_visible":
      return value === true ? adminCta("exposeStart", ko) : adminCta("exposeStop", ko);
    case "set_open":
      return value === true ? (ko ? "영업 중으로" : "Set open") : ko ? "영업 종료로" : "Set closed";
    case "set_business_hours":
      return ko ? "영업시간 복사 적용" : "Copy business hours";
    case "set_delivery_radius":
      return ko ? "배달 반경 적용" : "Apply delivery radius";
    case "set_featured":
      return value === true ? (ko ? "추천 매장 지정" : "Set featured") : ko ? "추천 매장 해제" : "Unset featured";
  }
}

export function AdminStoreListBulkBar({
  ko,
  selectedIds,
  scopeLabel,
  rowsById,
  onClear,
  onCompleted,
  onOpenDelete,
}: {
  ko: boolean;
  selectedIds: readonly string[];
  /** 「현재 선택」/「전체 결과」 표시 */
  scopeLabel: string;
  rowsById: ReadonlyMap<string, AdminStoreBulkRowLite>;
  onClear: () => void;
  onCompleted: (succeededIds: string[]) => void;
  onOpenDelete: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [radius, setRadius] = useState("");
  const [hoursSourceId, setHoursSourceId] = useState("");
  const [featuredFrom, setFeaturedFrom] = useState("");
  const [featuredTo, setFeaturedTo] = useState("");
  const [results, setResults] = useState<AdminStoreBulkResult[] | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const inFlight = useRef(false);

  const nameOf = (id: string) => (rowsById.get(id)?.store_name ?? "").trim();
  const visibleSelected = selectedIds.filter((id) => rowsById.has(id));

  const run = async (action: AdminStoreBulkAction, extra: Record<string, unknown>, valueForLabel: unknown) => {
    if (inFlight.current || busy || selectedIds.length === 0) return;
    setNotice(null);
    const label = actionLabel(action, valueForLabel, ko);
    const n = selectedIds.length;
    const preview = selectedIds
      .slice(0, PREVIEW_MAX)
      .map((id) => nameOf(id) || formatAdminShortId(id))
      .join(", ");
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("bulk"),
      ko,
      title: ko ? `매장 일괄 ${label}` : `Bulk: ${label}`,
      description: [
        ko ? `선택한 매장 ${formatAdminNumber(n)}곳에 「${label}」을(를) 실행합니다.` : `Run "${label}" on ${n} stores.`,
        `${ko ? "대상" : "Targets"}: ${preview}${n > 8 ? (ko ? ` 외 ${formatAdminNumber(n - 8)}곳` : ` +${n - 8}`) : ""}`,
        // v4 UI-04 — 관리자 숨김 = 오너 재노출 잠금 (O-04)
        action === "set_store_visible" ? adminStoreVisibilityLockConfirmCopy(valueForLabel === true, ko) : null,
      ]
        .filter(Boolean)
        .join("\n"),
      confirmLabel: label,
      retypeValue: ko ? `${formatAdminNumber(n)}곳 ${label}` : `${n} ${label}`,
    });
    if (!confirmed.ok) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/stores/bulk", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_ids: selectedIds, action, reason: confirmed.reason ?? "", ...extra }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        results?: AdminStoreBulkResult[];
        summary?: { total: number; success: number; failed: number };
      } | null;
      if (!json?.ok) {
        setNotice({ ok: false, text: adminOperatorErrorMessage(json?.error ?? "action_failed", ko) });
        return;
      }
      const list = json.results ?? [];
      setResults(list);
      const s = json.summary ?? { total: list.length, success: 0, failed: 0 };
      setNotice({
        ok: s.failed === 0,
        text: ko
          ? `${label}: 성공 ${formatAdminNumber(s.success)} · 실패 ${formatAdminNumber(s.failed)}`
          : `${label}: ${s.success} done · ${s.failed} failed`,
      });
      onCompleted(list.filter((r) => r.ok).map((r) => r.store_id));
    } catch {
      setNotice({ ok: false, text: adminOperatorErrorMessage("network_error", ko) });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const applyHours = async () => {
    if (!hoursSourceId) return;
    setBusy(true);
    let hours: unknown = undefined;
    try {
      const res = await fetch(`/api/admin/stores/${encodeURIComponent(hoursSourceId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; store?: { business_hours_json?: unknown } } | null;
      hours = json?.ok ? json.store?.business_hours_json : undefined;
    } catch {
      hours = undefined;
    } finally {
      setBusy(false);
    }
    if (hours === undefined) {
      setNotice({ ok: false, text: adminOperatorErrorMessage("load_failed", ko) });
      return;
    }
    await run("set_business_hours", { business_hours_json: hours ?? {} }, null);
  };

  const noticeBanner = notice ? (
    <div
      data-admin-result={notice.ok ? "success" : "error"}
      role={notice.ok ? "status" : "alert"}
      className={`flex items-start justify-between gap-3 border-b px-3 py-2 text-[13px] text-sam-fg ${
        notice.ok ? "border-sam-success bg-sam-success-soft" : "border-sam-danger bg-sam-danger-soft"
      }`}
    >
      <span className="whitespace-pre-wrap">{notice.text}</span>
      <AdminActionButton variant="quiet" size="sm" className="shrink-0" onClick={() => setNotice(null)}>
        {adminCta("close", ko)}
      </AdminActionButton>
    </div>
  ) : null;

  const resultList = results ? (
    <div className="border-b border-sam-border bg-sam-surface-muted px-3 py-2" data-admin-store-bulk-results="1">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold text-sam-fg">{ko ? "최근 일괄 결과 (매장별)" : "Last bulk result"}</p>
        <AdminActionButton variant="quiet" size="sm" onClick={() => setResults(null)}>
          {adminCta("close", ko)}
        </AdminActionButton>
      </div>
      <ul className="mt-1 max-h-32 space-y-0.5 overflow-auto text-[12px] text-sam-muted">
        {results.map((r) => (
          <li key={r.store_id} data-admin-store-bulk-result={r.ok ? "ok" : "fail"}>
            {nameOf(r.store_id) || "—"} <AdminTechId id={r.store_id} /> ·{" "}
            {r.ok ? (ko ? "성공" : "Done") : adminOperatorErrorMessage(r.error ?? "update_failed", ko)}
          </li>
        ))}
      </ul>
    </div>
  ) : null;

  if (selectedIds.length === 0) {
    return (
      <div data-admin-store-bulk-root="1">
        {noticeBanner}
        {resultList}
      </div>
    );
  }

  const radiusNum = Number(radius);
  const radiusValid = radius.trim() !== "" && Number.isFinite(radiusNum) && radiusNum > 0;

  return (
    <div data-admin-store-bulk-root="1">
      {noticeBanner}
      <div
        className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-sam-border bg-sam-surface px-3 py-2"
        data-admin-store-bulk-bar="1"
        data-admin-store-bulk-busy={busy ? "1" : "0"}
      >
        <span className="text-[13px] font-semibold text-sam-fg" data-admin-store-selected-count={selectedIds.length}>
          {ko ? `선택 ${formatAdminNumber(selectedIds.length)}곳` : `${selectedIds.length} selected`}
        </span>
        <span className="text-[12px] text-sam-muted">{scopeLabel}</span>
        <AdminActionButton variant="secondary" size="sm" disabled={busy} onClick={() => void run("set_store_visible", { enabled: true }, true)}>
          {adminCta("exposeStart", ko)}
        </AdminActionButton>
        <AdminActionButton variant="secondary" size="sm" disabled={busy} onClick={() => void run("set_store_visible", { enabled: false }, false)}>
          {adminCta("exposeStop", ko)}
        </AdminActionButton>
        <AdminActionButton variant="secondary" size="sm" disabled={busy} onClick={() => void run("set_open", { is_open: true }, true)}>
          {ko ? "영업 중으로" : "Set open"}
        </AdminActionButton>
        <AdminActionButton variant="secondary" size="sm" disabled={busy} onClick={() => void run("set_open", { is_open: false }, false)}>
          {ko ? "영업 종료로" : "Set closed"}
        </AdminActionButton>
        <span className="inline-flex items-center gap-1">
          <input
            type="number"
            min={0.1}
            step={0.1}
            inputMode="decimal"
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
            placeholder={ko ? "반경 km" : "Radius km"}
            aria-label={ko ? "배달 반경 km" : "Delivery radius km"}
            className="h-8 w-24 rounded-ui-rect border border-sam-border bg-sam-surface px-2 text-[13px] text-sam-fg"
          />
          <AdminActionButton
            variant="secondary"
            size="sm"
            disabled={busy || !radiusValid}
            onClick={() => void run("set_delivery_radius", { delivery_radius_km: radiusNum }, radiusNum)}
          >
            {ko ? "배달 반경 적용" : "Apply radius"}
          </AdminActionButton>
        </span>
        <span className="inline-flex items-center gap-1" data-admin-store-bulk-featured="1">
          <input
            type="date"
            value={featuredFrom}
            onChange={(e) => setFeaturedFrom(e.target.value)}
            aria-label={ko ? "추천 시작일" : "Featured from"}
            className="h-8 rounded-ui-rect border border-sam-border bg-sam-surface px-2 text-[13px] text-sam-fg"
          />
          <span className="text-[12px] text-sam-muted">~</span>
          <input
            type="date"
            value={featuredTo}
            onChange={(e) => setFeaturedTo(e.target.value)}
            aria-label={ko ? "추천 종료일" : "Featured to"}
            className="h-8 rounded-ui-rect border border-sam-border bg-sam-surface px-2 text-[13px] text-sam-fg"
          />
          <AdminActionButton
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(
                "set_featured",
                {
                  enabled: true,
                  featured_start_at: featuredFrom ? manilaDateInputToIso(featuredFrom, "start") : null,
                  featured_end_at: featuredTo ? manilaDateInputToIso(featuredTo, "end") : null,
                },
                true
              )
            }
          >
            {ko ? "추천 매장 지정" : "Set featured"}
          </AdminActionButton>
          <AdminActionButton
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void run("set_featured", { enabled: false }, false)}
          >
            {ko ? "추천 매장 해제" : "Unset featured"}
          </AdminActionButton>
        </span>
        {visibleSelected.length > 0 ? (
          <span className="inline-flex items-center gap-1">
            <select
              value={hoursSourceId}
              onChange={(e) => setHoursSourceId(e.target.value)}
              aria-label={ko ? "영업시간 기준 매장" : "Business hours source"}
              className="h-8 max-w-[180px] rounded-ui-rect border border-sam-border bg-sam-surface px-2 text-[13px] text-sam-fg"
            >
              <option value="">{ko ? "영업시간 기준 매장" : "Hours source"}</option>
              {visibleSelected.map((id) => (
                <option key={id} value={id}>
                  {nameOf(id) || formatAdminShortId(id)}
                </option>
              ))}
            </select>
            <AdminActionButton variant="secondary" size="sm" disabled={busy || !hoursSourceId} onClick={() => void applyHours()}>
              {ko ? "영업시간 복사 적용" : "Copy hours"}
            </AdminActionButton>
          </span>
        ) : null}
        <AdminActionButton variant="danger" size="sm" disabled={busy} onClick={onOpenDelete} data-admin-store-bulk-delete="1">
          {ko ? "샘플 삭제" : "Delete samples"}
        </AdminActionButton>
        <AdminActionButton variant="quiet" size="sm" disabled={busy} onClick={onClear}>
          {ko ? "선택 해제" : "Clear selection"}
        </AdminActionButton>
      </div>
      {resultList}
    </div>
  );
}
