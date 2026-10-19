"use client";

/**
 * CUT B — Cash top-up queue wired to canonical AST-005 API.
 * Legacy `/api/admin/delivery-ads/business-cash/charge-requests` PATCH stays 410 (NO_NEW_WRITE).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminActionConfirmDialog } from "@/components/admin/ui/AdminActionConfirmDialog";
import { CurrencyBadge } from "@/components/currency/CurrencyBadge";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import { adminOperatorErrorMessage, adminOperatorLabel } from "@/lib/admin/operator-ux/operator-labels";
import { AdminErrorState, AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import { emitAdminQueueChanged } from "@/lib/admin/admin-queue-events";

type ChargeRequest = {
  id: string;
  store_id: string;
  /** Joined from `stores.store_name` by the API (null when unavailable). */
  store_name?: string | null;
  owner_user_id: string;
  amount_minor: number;
  status: string;
  created_at: string;
  reject_reason?: string | null;
};

type ActionResult = {
  ok: boolean;
  error?: string;
  idempotent?: boolean;
  ledgerId?: string;
  balanceAfterMinor?: number;
};

export function AdminDeliveryAdCashChargeQueuePage() {
  const { t, safeT, language } = useI18n();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const focusRequestId = (searchParams.get("requestId") ?? "").trim();
  /** `?store_id=` (legacy `?storeId=`) — server-side store filter on the queue API. */
  const storeFilter = (searchParams.get("store_id") ?? searchParams.get("storeId") ?? "").trim();
  const clearStoreFilter = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("store_id");
    next.delete("storeId");
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  }, [pathname, router, searchParams]);
  const [rows, setRows] = useState<ChargeRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const ko = language !== "en";
  /** List load failure (code) — rendered via AdminErrorState, never raw. */
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | undefined>(undefined);
  /** Action failure (operator sentence already mapped). */
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  /** Ledger id of the last credit — technical detail only (not in the banner). */
  const [successLedgerId, setSuccessLedgerId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; op: "approve" | "reject" } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setErrorStatus(undefined);
    try {
      // Deep-link requestId may point at a decided row — load all when focusing.
      const statusQ = focusRequestId ? "all" : "PENDING";
      const qs = new URLSearchParams({ status: statusQ });
      if (storeFilter) qs.set("store_id", storeFilter);
      const res = await fetch(`/api/admin/business-cash-charges?${qs.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        requests?: ChargeRequest[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error || "load_failed");
        setErrorStatus(res.status);
        setLoaded(true);
        return;
      }
      let next = json.requests ?? [];
      if (focusRequestId) {
        const hit = next.find((r) => r.id === focusRequestId);
        const pending = next.filter((r) => String(r.status).toUpperCase() === "PENDING");
        next = hit
          ? [hit, ...pending.filter((r) => r.id !== hit.id)]
          : pending;
      }
      setRows(next);
    } catch {
      setError("network_error");
    } finally {
      setLoaded(true);
    }
  }, [focusRequestId, storeFilter]);

  const storeFilterLabel =
    (storeFilter && rows.find((r) => r.store_id === storeFilter)?.store_name?.trim()) || storeFilter;

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!loaded || !focusRequestId) return;
    const el = document.querySelector(`[data-admin-cash-charge-row="${CSS.escape(focusRequestId)}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.setAttribute("data-admin-cash-charge-focus", "1");
      el.classList.add("ring-2", "ring-signature");
    }
  }, [loaded, focusRequestId, rows]);

  const act = async (id: string, op: "approve" | "reject", reason: string) => {
    setBusyId(id);
    setSuccess(null);
    setSuccessLedgerId(null);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/business-cash-charges", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op,
          requestId: id,
          reason: op === "reject" ? reason.trim() : undefined,
        }),
      });
      const json = (await res.json().catch(() => ({ ok: false }))) as ActionResult;
      if (!res.ok || !json.ok) {
        // 다른 관리자가 먼저 처리했거나 사라진 신청 — 안내 후 최신 목록으로 다시 불러온다.
        if (json.error === "not_pending" || json.error === "not_found") {
          setActionError(t("admin_r4_cash_charge_not_pending"));
          await load();
          return;
        }
        setActionError(
          json.error || res.status === 403
            ? adminOperatorErrorMessage(res.status === 403 ? "forbidden" : String(json.error), ko)
            : safeT("admin_delivery_ads_cash_charges_action_failed", {
                fallbackKo: "Cash 충전 처리에 실패했습니다. 잔액·원장은 변경되지 않았을 수 있습니다.",
                fallbackEn:
                  "Cash top-up action failed. Balance/ledger may be unchanged.",
              })
        );
        return;
      }
      emitAdminQueueChanged("cash_charges");
      if (op === "approve") {
        // 카탈로그 「적립 완료」 키는 잔액·중복 여부를 담지 못해 결과 문구가 같아졌다 — 전용 키로 구분.
        setSuccess(
          json.idempotent
            ? t("admin_r4_cash_charge_approve_idempotent")
            : t("admin_r4_cash_charge_approve_ok", {
                balance: formatDeliveryAdPhpMinor(json.balanceAfterMinor ?? 0),
              })
        );
        setSuccessLedgerId(json.ledgerId ?? null);
      } else {
        setSuccess(
          safeT("admin_delivery_ads_cash_charges_reject_ok", {
            fallbackKo: "거절 완료. Cash 잔액은 변경되지 않았습니다.",
            fallbackEn: "Rejected. Cash balance was not changed.",
          })
        );
      }
      await load();
    } catch {
      setActionError(adminOperatorErrorMessage("network_error", ko));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className="space-y-4 p-4"
      data-admin-delivery-ads-cash-charges="1"
      data-admin-cash-charges-canonical="1"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CurrencyBadge currency="cash" />
            <h1 className="text-[20px] font-bold text-sam-fg">
              {ko ? "매장 캐시 충전 승인" : "Store Cash top-up approval"}
            </h1>
          </div>
          <p className="mt-1 text-[13px] text-sam-muted">
            {safeT("admin_delivery_ads_cash_charges_help", {
              fallbackKo:
                "확인 후 적립하면 Cash 원장에만 반영됩니다. Coin·Point와 분리됩니다. 광고비도 Cash만 사용합니다.",
              fallbackEn:
                "Confirmation credits the Cash ledger only — separate from Coin and Point. Ads also spend Cash only.",
            })}
          </p>
          {storeFilter ? (
            <span
              className="mt-2 inline-flex max-w-full items-center gap-2 rounded-full border border-sam-border bg-sam-surface-muted px-3 py-1 text-[12px] text-sam-fg"
              data-admin-cash-charge-store-filter-chip="1"
            >
              <span className="truncate" title={storeFilter}>
                {ko ? "매장 필터" : "Store filter"}: {storeFilterLabel}
              </span>
              <button
                type="button"
                className="shrink-0 font-medium underline"
                onClick={clearStoreFilter}
                aria-label={ko ? "매장 필터 해제" : "Clear store filter"}
              >
                {ko ? "해제" : "Clear"}
              </button>
            </span>
          ) : null}
        </div>
        <Link
          href="/admin/finance"
          className="min-h-[36px] shrink-0 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[12px] font-semibold text-sam-fg"
        >
          {ko ? "재무 홈" : "Finance home"}
        </Link>
      </div>

      {success ? (
        <p
          className="rounded-ui-rect border border-[#0A823E]/40 bg-[#0A823E]/10 px-3 py-2 text-[13px] text-[#0A823E]"
          role="status"
          data-admin-cash-charge-success="1"
        >
          {success}
          {successLedgerId ? <AdminTechDetails ko={ko}>ledger {successLedgerId}</AdminTechDetails> : null}
        </p>
      ) : null}

      {actionError ? (
        <p
          className="rounded-ui-rect border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-900"
          role="alert"
          data-admin-cash-charge-action-error="1"
        >
          {actionError}
        </p>
      ) : null}

      <AdminCard
        title={safeT("admin_delivery_ads_cash_charges_title", {
          fallbackKo: "Cash 충전 신청",
          fallbackEn: "Cash top-up requests",
        })}
      >
        {!loaded ? (
          <p className="text-[13px] text-sam-muted">
            {safeT("common_loading", {
              fallbackKo: "불러오는 중…",
              fallbackEn: "Loading…",
            })}
          </p>
        ) : error ? (
          <div data-admin-cash-charge-error="1">
            <AdminErrorState ko={ko} code={error} httpStatus={errorStatus} onRetry={() => void load()} />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-sam-muted">
            {safeT("admin_delivery_ads_cash_charges_empty", {
              fallbackKo: "대기 중인 Cash 충전 신청이 없습니다.",
              fallbackEn: "No open Cash top-up requests.",
            })}
          </p>
        ) : (
          <ul className="divide-y divide-sam-border">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
                data-admin-cash-charge-row={r.id}
              >
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-sam-fg">
                    {formatDeliveryAdPhpMinor(r.amount_minor)}
                  </p>
                  <p className="truncate text-[12px] text-sam-muted">
                    {safeT("admin_delivery_ads_cash_charges_store", {
                      fallbackKo: "매장",
                      fallbackEn: "Store",
                    })}
                    :{" "}
                    {r.store_name?.trim() ||
                      (ko ? "매장 이름 없음 · 기술 정보 참고" : "Unnamed store · see technical details")}
                  </p>
                  <p className="text-[11px] text-sam-muted">
                    {r.created_at
                      ? new Date(String(r.created_at)).toLocaleString()
                      : "—"}{" "}
                    · {adminOperatorLabel(r.status, language !== "en")}
                  </p>
                  <AdminTechDetails ko={ko}>
                    store {r.store_id}
                    <br />
                    owner {r.owner_user_id}
                    {r.reject_reason ? (
                      <>
                        <br />
                        reason {r.reject_reason}
                      </>
                    ) : null}
                  </AdminTechDetails>
                  <Link
                    href={`/admin/finance?storeId=${encodeURIComponent(r.store_id)}`}
                    className="mt-1 inline-block text-[12px] font-semibold text-[var(--currency-cash-accent)] hover:underline"
                  >
                    {ko ? "매장 재무" : "Store finance"}
                  </Link>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="min-h-[40px] rounded-ui-rect border border-[#0A823E] px-3 text-[12px] font-semibold text-[#0A823E]"
                    disabled={busyId != null}
                    onClick={() => setConfirm({ id: r.id, op: "approve" })}
                    data-admin-cash-charge-complete={r.id}
                  >
                    {safeT("admin_delivery_ads_cash_charges_complete", {
                      fallbackKo: "입금 확인 · 적립",
                      fallbackEn: "Confirm · Credit",
                    })}
                  </button>
                  <button
                    type="button"
                    className="min-h-[40px] rounded-ui-rect border border-red-300 px-3 text-[12px] font-semibold text-red-700"
                    disabled={busyId != null}
                    onClick={() => setConfirm({ id: r.id, op: "reject" })}
                    data-admin-cash-charge-reject={r.id}
                  >
                    {safeT("admin_delivery_ads_cash_charges_reject", {
                      fallbackKo: "거절",
                      fallbackEn: "Reject",
                    })}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      <AdminActionConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm?.op === "approve"
            ? language === "en"
              ? "Credit Cash for this top-up?"
              : "이 충전 건을 Cash로 적립하시겠습니까?"
            : language === "en"
              ? "Reject this Cash top-up?"
              : "이 Cash 충전 신청을 거절하시겠습니까?"
        }
        description={
          confirm
            ? (() => {
                const row = rows.find((r) => r.id === confirm.id);
                if (!row) return "";
                const when = row.created_at ? new Date(String(row.created_at)).toLocaleString() : "";
                if (confirm.op === "reject") {
                  return ko
                    ? `${formatDeliveryAdPhpMinor(row.amount_minor)} · ${when} — 거절 사유는 매장 사장님에게 전달되고 작업 기록에 남습니다. 캐시 잔액은 바뀌지 않습니다.`
                    : `${formatDeliveryAdPhpMinor(row.amount_minor)} · ${when} — The reason is sent to the store owner and kept in the activity log. Cash balance does not change.`;
                }
                return `${formatDeliveryAdPhpMinor(row.amount_minor)} · ${when}`;
              })()
            : ""
        }
        confirmLabel={confirm?.op === "approve" ? (language === "en" ? "Credit" : "적립") : language === "en" ? "Reject" : "거절"}
        cancelLabel={language === "en" ? "Cancel" : "취소"}
        tone={confirm?.op === "reject" ? "danger" : "primary"}
        reasonRequired={confirm?.op === "reject"}
        reasonLabel={ko ? "거절 사유 (2자 이상)" : "Rejection reason (2+ characters)"}
        reasonPlaceholder={ko ? "예: 입금 내역이 확인되지 않음" : "e.g. Payment not found"}
        pending={busyId != null}
        onCancel={() => setConfirm(null)}
        onConfirm={(reason) => {
          if (!confirm) return;
          const { id, op } = confirm;
          if (op === "reject" && reason.trim().length < 2) {
            setActionError(adminOperatorErrorMessage("reason_required", ko));
            return;
          }
          setConfirm(null);
          void act(id, op, reason);
        }}
      />
    </div>
  );
}
