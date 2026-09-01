"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { buildAdminGiftOpsHref } from "@/lib/gift-certificate/admin-gift-ops-tabs";
import {
  ADMIN_GIFT_PRIMARY_BTN_STYLE,
  adminGiftPrimaryBtnClass,
} from "@/lib/gift-certificate/admin-gift-primary-button";
import { formatGiftAdminValidityLabel } from "@/lib/gift-certificate/format-gift-admin-validity";
import { formatMoneyPhp } from "@/lib/utils/format";
import { Sam } from "@/lib/ui/css-vars";

const TRACKING_API = "/api/admin/gift-certificates/tracking";

type InstanceRow = {
  id: string;
  publicGiftNumber: string;
  giftScope?: "STORE" | "PLATFORM";
  storeId: string | null;
  storeName: string;
  productId: string;
  productTitle: string;
  productImageUrl?: string | null;
  originalBuyerUserId: string;
  originalBuyerLabel: string;
  currentOwnerUserId: string;
  currentOwnerLabel: string;
  faceValue: number;
  purchasePrice: number;
  remainingBalance: number;
  status: string;
  purchasedAt: string;
  createdAt: string;
  validFrom?: string | null;
  validUntil?: string | null;
};

type TrackingDetail = {
  instance: InstanceRow;
  ownership: Array<{
    id: string;
    seq: number;
    eventType: string;
    fromLabel: string;
    toLabel: string;
    createdAt: string;
  }>;
  transfers: Array<{
    id: string;
    senderLabel: string;
    recipientLabel: string;
    status: string;
    offeredAt: string;
    resolvedAt: string | null;
    roomId: string | null;
    messageId: string | null;
  }>;
  redemptions: Array<{
    id: string;
    orderId: string;
    orderNo: string | null;
    orderStatus: string | null;
    redeemedStoreId?: string | null;
    redeemedStoreName?: string;
    usedAmount: number;
    platformFee: number;
    merchantNet: number;
    feeRate: number;
    reversed: boolean;
    createdAt: string;
    reversedAt: string | null;
    revenue: Array<{ id: string; entryType: string; amount: number; createdAt: string }>;
  }>;
  settlement?: {
    availableRevenue: number;
    cashOuts: Array<{
      id: string;
      amount: number;
      status: string;
      createdAt: string;
      paidAt: string | null;
    }>;
    conversions: Array<{
      id: string;
      amount: number;
      status: string;
      createdAt: string;
      approvedAt: string | null;
    }>;
  };
  recovery?: Array<{
    id: string;
    linkage: string;
    amountOriginal: number;
    amountRemaining: number;
    status: string;
  }>;
  promo?: {
    obligationAmount: number;
    ledgerEntries: Array<{ id: string; entryType: string; amount: number; createdAt: string }>;
  };
};

function dt(v: string | null | undefined): string {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return v;
  }
}

function formatValidity(from: string | null | undefined, until: string | null | undefined): string {
  return formatGiftAdminValidityLabel({
    validFrom: from,
    validUntil: until,
    noExpiryLabel: "—",
  });
}

function recognitionLabel(entries: { entryType: string }[], reversed: boolean): string {
  if (reversed) return "REVERSED";
  if (entries.some((e) => e.entryType === "REVENUE_AVAILABLE")) return "RECOGNIZED";
  return "PENDING";
}

function buildTrackingQuery(args: { q?: string; status?: string; id: string }): string {
  const qs = new URLSearchParams();
  if (args.q?.trim()) qs.set("q", args.q.trim());
  if (args.status?.trim()) qs.set("status", args.status.trim());
  qs.set("id", args.id.trim());
  return qs.toString();
}

export function AdminGiftInstanceDetailConsole({
  instanceId,
  listQ = "",
  listStatus = "",
  focus = "",
}: {
  instanceId: string;
  listQ?: string;
  listStatus?: string;
  focus?: string;
}) {
  const { safeT } = useI18n();
  const [detail, setDetail] = useState<TrackingDetail | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [adjustUntil, setAdjustUntil] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const seqRef = useRef(0);

  const backHref = buildAdminGiftOpsHref({
    tab: "instances",
    extra: { q: listQ.trim() || null, status: listStatus.trim() || null },
  });

  const load = useCallback(async () => {
    const trimmed = instanceId.trim();
    if (!trimmed) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = ++seqRef.current;

    setState("loading");
    const query = buildTrackingQuery({ q: listQ, status: listStatus, id: trimmed });

    try {
      const res = await fetch(`${TRACKING_API}?${query}`, {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
      if (seq !== seqRef.current) return;

      const json = (await res.json()) as {
        ok?: boolean;
        detail?: TrackingDetail | null;
      };
      if (!res.ok || !json.ok || !json.detail) {
        setDetail(null);
        setState("error");
        return;
      }

      setDetail(json.detail);
      setState("ready");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (seq !== seqRef.current) return;
      setDetail(null);
      setState("error");
    }
  }, [instanceId, listQ, listStatus]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const runCorrective = async (action: "suspend" | "resume" | "adjust_validity") => {
    if (actionBusy || !reason.trim()) {
      setActionError(
        safeT("gift_ops_corrective_reason_required", {
          fallbackKo: "사유를 입력해 주세요.",
          fallbackEn: "Reason is required.",
        })
      );
      return;
    }
    setActionBusy(true);
    setActionError(null);
    try {
      const body: Record<string, unknown> = { action, reason: reason.trim() };
      if (action === "adjust_validity") {
        body.validUntil = adjustUntil.trim() || null;
      }
      const res = await fetch(
        `/api/admin/gift-certificates/instances/${encodeURIComponent(instanceId.trim())}/corrective`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setActionError(json.error || "action_failed");
        return;
      }
      setReason("");
      setAdjustUntil("");
      await load();
    } finally {
      setActionBusy(false);
    }
  };

  const row = detail?.instance;
  const redeemedGross = (detail?.redemptions ?? [])
    .filter((r) => !r.reversed)
    .reduce((sum, r) => sum + Math.max(0, r.usedAmount), 0);
  const focusRedemptionId = focus.startsWith("redemption:") ? focus.slice("redemption:".length) : "";

  const timeline = useMemo(() => {
    if (!detail) return [] as Array<{ id: string; at: string; kind: string; label: string; focus?: boolean }>;
    const items: Array<{ id: string; at: string; kind: string; label: string; focus?: boolean }> = [];
    const inst = detail.instance;
    if (inst.purchasedAt || inst.createdAt) {
      items.push({
        id: `issued:${inst.id}`,
        at: inst.purchasedAt || inst.createdAt,
        kind: "ISSUED",
        label: `ISSUED · ${formatMoneyPhp(inst.faceValue)}`,
      });
    }
    for (const e of detail.ownership) {
      items.push({
        id: `own:${e.id}`,
        at: e.createdAt,
        kind: e.eventType || "OWNERSHIP",
        label: `${e.eventType}: ${e.fromLabel || "—"} → ${e.toLabel || "—"}`,
      });
    }
    for (const t of detail.transfers) {
      items.push({
        id: `xfer:${t.id}`,
        at: t.offeredAt,
        kind: "TRANSFER",
        label: `TRANSFER ${t.status}: ${t.senderLabel} → ${t.recipientLabel}`,
      });
    }
    for (const r of detail.redemptions) {
      items.push({
        id: `redeem:${r.id}`,
        at: r.createdAt,
        kind: "REDEMPTION",
        label: `REDEEM ${formatMoneyPhp(r.usedAmount)} · ${recognitionLabel(r.revenue ?? [], r.reversed)}${
          r.orderNo ? ` · #${r.orderNo}` : ""
        }`,
        focus: focusRedemptionId === r.id,
      });
    }
    return items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }, [detail, focusRedemptionId]);

  if (state === "loading" && !detail) {
    return (
      <p className="text-sm text-sam-muted" data-admin-gift-instance-detail-loading="1">
        {safeT("gift_ops_instance_detail_loading", {
          fallbackKo: "상품권 상세를 불러오는 중…",
          fallbackEn: "Loading gift instance detail…",
        })}
      </p>
    );
  }

  if (state === "error" || !row || !detail) {
    return (
      <div className="space-y-3" data-admin-gift-instance-detail-error="1">
        <Link href={backHref} className={`${Sam.btn.secondary} inline-flex min-h-[44px] items-center px-4 text-sm`}>
          ← {safeT("gift_ops_instance_back_list", { fallbackKo: "발급 상품권", fallbackEn: "Issued gifts" })}
        </Link>
        <p className="text-sm text-red-600">
          {safeT("gift_ops_instance_detail_error", {
            fallbackKo: "상품권 상세를 불러오지 못했습니다.",
            fallbackEn: "Couldn’t load gift instance detail.",
          })}
        </p>
        <button type="button" className={Sam.btn.secondary} onClick={() => void load()}>
          {safeT("gift_ops_retry", { fallbackKo: "다시 시도", fallbackEn: "Retry" })}
        </button>
      </div>
    );
  }

  return (
    <section className="space-y-4" data-admin-gift-instance-detail="1" data-admin-gift-instance-id={row.id}>
      <Link
        href={backHref}
        className={`${Sam.btn.secondary} inline-flex min-h-[44px] items-center px-4 text-sm`}
        data-admin-gift-instance-back="1"
      >
        ← {safeT("gift_ops_instance_back_list", { fallbackKo: "발급 상품권", fallbackEn: "Issued gifts" })}
      </Link>

      <div
        className="flex flex-col gap-4 rounded-ui-rect border border-sam-border bg-sam-surface p-4 sm:flex-row"
        data-admin-gift-instance-header="1"
      >
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-ui-rect border border-sam-border bg-sam-app">
          {row.productImageUrl ? (
            <SamarketThumbnail
              src={row.productImageUrl}
              alt=""
              fill
              className="relative h-full w-full"
              imageClassName="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-sam-muted">—</div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-mono text-lg font-semibold">{row.publicGiftNumber || "—"}</p>
          <p className="text-sm font-semibold">{row.productTitle || "—"}</p>
          <p className="text-sm text-sam-muted">
            {row.giftScope === "PLATFORM"
              ? safeT("gift_ops_type_platform", { fallbackKo: "DIBAY 상품권", fallbackEn: "DIBAY Gift" })
              : row.storeName || "—"}{" "}
            · {row.status}
          </p>
          {row.productId ? (
            <Link
              href={buildAdminGiftOpsHref({ tab: "products", extra: { id: row.productId } })}
              className="inline-block text-xs font-semibold text-sam-brand"
              data-admin-gift-cta-product-settings="1"
            >
              {safeT("gift_ops_cta_product_settings", {
                fallbackKo: "상품 설정 보기",
                fallbackEn: "View product settings",
              })}
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-admin-gift-instance-summary="1">
        {[
          {
            label: safeT("gift_ops_kpi_face", { fallbackKo: "최초 금액", fallbackEn: "Face value" }),
            value: formatMoneyPhp(row.faceValue),
          },
          {
            label: safeT("gift_ops_kpi_remaining", { fallbackKo: "현재 잔액", fallbackEn: "Remaining" }),
            value: formatMoneyPhp(row.remainingBalance),
          },
          {
            label: safeT("gift_ops_kpi_redeemed_gross", { fallbackKo: "누적 사용", fallbackEn: "Redeemed" }),
            value: formatMoneyPhp(redeemedGross),
          },
          {
            label: safeT("gift_ops_field_validity", { fallbackKo: "유효기간", fallbackEn: "Validity" }),
            value: formatValidity(row.validFrom, row.validUntil),
          },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
            <p className="text-xs text-sam-muted">{kpi.label}</p>
            <p className="text-sm font-semibold tabular-nums break-words">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div
        className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 space-y-2 text-sm"
        data-admin-gift-instance-owner="1"
      >
        <h3 className="font-semibold">
          {safeT("gift_ops_sec_buyer_owner", { fallbackKo: "구매자 / 현재 소유자", fallbackEn: "Buyer / owner" })}
        </h3>
        <p>
          {safeT("gift_ops_field_buyer", { fallbackKo: "구매자", fallbackEn: "Buyer" })}: {row.originalBuyerLabel || "—"}
        </p>
        <p>
          {safeT("gift_ops_field_owner", { fallbackKo: "현재 소유자", fallbackEn: "Current owner" })}:{" "}
          {row.currentOwnerLabel || "—"}
        </p>
        <p className="text-xs text-sam-muted">
          {safeT("gift_ops_field_issued_at", { fallbackKo: "발급일", fallbackEn: "Issued" })}:{" "}
          {dt(row.purchasedAt || row.createdAt)} · ID: {row.id}
        </p>
      </div>

      <div
        className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 space-y-3 text-sm"
        data-admin-gift-instance-timeline="1"
      >
        <h3 className="font-semibold">
          {safeT("gift_ops_sec_lifecycle_timeline", {
            fallbackKo: "생명주기 타임라인",
            fallbackEn: "Lifecycle timeline",
          })}
        </h3>
        {timeline.length === 0 ? (
          <p className="text-sam-muted">
            {safeT("gift_ops_timeline_empty", {
              fallbackKo: "타임라인 이벤트가 없습니다.",
              fallbackEn: "No timeline events.",
            })}
          </p>
        ) : (
          <ol className="relative space-y-0 border-l border-sam-border pl-4">
            {timeline.map((item) => (
              <li
                key={item.id}
                id={item.kind === "REDEMPTION" ? item.id.replace("redeem:", "redemption-") : undefined}
                className={[
                  "relative pb-4 last:pb-0",
                  item.focus ? "rounded-ui-rect bg-sam-app/80 ring-2 ring-sam-brand px-2 -ml-1" : "",
                ].join(" ")}
                data-focus-redemption={item.focus ? "1" : "0"}
              >
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-sam-brand" />
                <p className="text-xs text-sam-muted">{dt(item.at)}</p>
                <p className="font-medium">{item.label}</p>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 space-y-2 text-sm">
        <h3 className="font-semibold">
          {safeT("gift_ops_sec_balance", { fallbackKo: "잔액", fallbackEn: "Balance" })}
        </h3>
        <p className="tabular-nums">
          {safeT("gift_ops_kpi_remaining", { fallbackKo: "현재 잔액", fallbackEn: "Remaining" })}:{" "}
          {formatMoneyPhp(row.remainingBalance)}
        </p>
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 space-y-2 text-sm">
        <h3 className="font-semibold">
          {safeT("gift_ops_sec_settlement", { fallbackKo: "정산", fallbackEn: "Settlement" })}
        </h3>
        {!detail.settlement && (detail.recovery ?? []).length === 0 ? (
          <p className="text-sam-muted">
            {safeT("gift_ops_settlement_empty", { fallbackKo: "정산 데이터가 없습니다.", fallbackEn: "No settlement data." })}
          </p>
        ) : (
          <>
            {detail.settlement ? (
              <p className="tabular-nums">
                {safeT("gift_ops_settlement_available", {
                  fallbackKo: "Available Gift Revenue",
                  fallbackEn: "Available Gift Revenue",
                })}
                : {formatMoneyPhp(detail.settlement.availableRevenue)}
              </p>
            ) : null}
            {(detail.settlement?.cashOuts.length ?? 0) === 0 &&
            (detail.settlement?.conversions.length ?? 0) === 0 ? (
              <p className="text-xs text-sam-muted">
                {safeT("gift_ops_settlement_moves_empty", {
                  fallbackKo: "환전·전환 내역이 없습니다.",
                  fallbackEn: "No cash-out or conversion rows.",
                })}
              </p>
            ) : (
              <ul className="space-y-1 text-xs">
                {(detail.settlement?.cashOuts ?? []).map((c) => (
                  <li key={c.id}>
                    {safeT("gift_ops_cash_out", { fallbackKo: "외부 환전", fallbackEn: "Cash out" })}{" "}
                    {formatMoneyPhp(c.amount)} · {c.status} · {dt(c.createdAt)}
                  </li>
                ))}
                {(detail.settlement?.conversions ?? []).map((c) => (
                  <li key={c.id}>
                    {safeT("gift_ops_store_cash", { fallbackKo: "과거 전환 기록", fallbackEn: "Historical conversion" })}{" "}
                    {formatMoneyPhp(c.amount)} · {c.status} · {dt(c.createdAt)}
                  </li>
                ))}
              </ul>
            )}
            {(detail.recovery ?? []).length > 0 ? (
              <div className="mt-2">
                <p className="text-xs font-semibold">Recovery</p>
                <ul className="mt-1 space-y-1 text-xs">
                  {(detail.recovery ?? []).map((r) => (
                    <li key={r.id}>
                      {r.linkage} · {formatMoneyPhp(r.amountRemaining)} / {formatMoneyPhp(r.amountOriginal)} · {r.status}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-sam-muted">
                {safeT("gift_ops_recovery_none", {
                  fallbackKo: "관련 Recovery 없음",
                  fallbackEn: "No related recovery",
                })}
              </p>
            )}
          </>
        )}
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 space-y-3 text-sm">
        <h3 className="font-semibold">
          {safeT("gift_ops_sec_corrective", {
            fallbackKo: "운영 조치 (전용)",
            fallbackEn: "Admin corrective actions",
          })}
        </h3>
        <p className="text-xs text-sam-muted">
          {safeT("gift_ops_corrective_note", {
            fallbackKo: "잔액 필드를 직접 수정하지 않습니다. 사유 필수 · 전용 RPC만 사용합니다.",
            fallbackEn: "No direct balance field edit. Reason required · dedicated RPC only.",
          })}
        </p>
        <label className="block space-y-1 text-sm">
          <span>{safeT("gift_ops_corrective_reason", { fallbackKo: "사유", fallbackEn: "Reason" })}</span>
          <input
            className={Sam.input.base}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="…"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>
            {safeT("gift_ops_corrective_valid_until", {
              fallbackKo: "유효기간 종료 (비우면 만료 없음)",
              fallbackEn: "Valid until (empty = no expiry)",
            })}
          </span>
          <input
            className={Sam.input.base}
            type="date"
            value={adjustUntil}
            onChange={(e) => setAdjustUntil(e.target.value)}
          />
        </label>
        {actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`${Sam.btn.secondary} min-h-[40px] px-3 text-sm`}
            disabled={actionBusy}
            onClick={() => void runCorrective("suspend")}
          >
            {safeT("gift_ops_cta_suspend", { fallbackKo: "사용 정지", fallbackEn: "Suspend" })}
          </button>
          <button
            type="button"
            className={`${Sam.btn.secondary} min-h-[40px] px-3 text-sm`}
            disabled={actionBusy}
            onClick={() => void runCorrective("resume")}
          >
            {safeT("gift_ops_cta_resume_instance", { fallbackKo: "사용 재개", fallbackEn: "Resume" })}
          </button>
          <button
            type="button"
            className={`${Sam.btn.secondary} min-h-[40px] px-3 text-sm`}
            disabled={actionBusy}
            onClick={() => void runCorrective("adjust_validity")}
          >
            {safeT("gift_ops_cta_adjust_validity", {
              fallbackKo: "유효기간 조정",
              fallbackEn: "Adjust validity",
            })}
          </button>
        </div>
      </div>
    </section>
  );
}
