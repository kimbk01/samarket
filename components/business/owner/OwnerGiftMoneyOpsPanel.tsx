"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import {
  OWNER_ADMIN_LIST_CARD_CLASS,
  OWNER_ADMIN_OUTLINE_BTN_CLASS,
  OWNER_ADMIN_PRIMARY_BTN_CLASS,
} from "@/lib/business/owner-admin-list-ui";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import {
  aggregateOwnerRedemptionKpis,
  canRequestGiftCashConversion,
  conversionPendingAmount,
  ownerConversionRequestStatusLabelKey,
  ownerRedemptionStatusLabelKey,
  validateGiftConversionAmount,
  type OwnerGiftConversionRow,
  type OwnerGiftRedemptionRow,
} from "@/lib/gift-certificate/owner-gift-money-ops";
import type { MessageKey } from "@/lib/i18n/messages";
import { formatMoneyPhp } from "@/lib/utils/format";
import { Sam } from "@/lib/ui/css-vars";

type MoneyView = "money" | "redemptions" | "convert" | "convert-success" | "convert-history";

type RevenuePayload = {
  availableRevenue: number;
  storeCashBalance: number;
  openRecoveryAmount: number;
  outstandingBalance: number;
};

function mapConversion(raw: Record<string, unknown>): OwnerGiftConversionRow {
  return {
    id: String(raw.id),
    amount: Math.trunc(Number(raw.amount) || 0),
    status: String(raw.status ?? ""),
    createdAt: String(raw.created_at ?? ""),
    approvedAt: raw.approved_at == null ? null : String(raw.approved_at),
  };
}

function mapHumanConversionError(
  code: string,
  safeT: (key: MessageKey, opts?: { fallbackKo: string; fallbackEn: string }) => string
): string {
  const c = code.toLowerCase();
  if (c.includes("insufficient") || c.includes("available")) {
    return safeT("gift_u5_err_insufficient", {
      fallbackKo: "전환 가능한 상품권 수익이 부족합니다.",
      fallbackEn: "Not enough available gift revenue.",
    });
  }
  if (c.includes("recovery")) {
    return safeT("gift_u5_err_recovery", {
      fallbackKo: "정산 조정 금액이 있어 Cash 전환을 신청할 수 없습니다.",
      fallbackEn: "A settlement adjustment blocks cash conversion.",
    });
  }
  return safeT("gift_u5_err_generic", {
    fallbackKo: "Cash 전환 신청에 실패했습니다. 다시 시도해 주세요.",
    fallbackEn: "Couldn’t submit the conversion request. Please try again.",
  });
}

export function OwnerGiftMoneyOpsPanel(props: {
  storeId: string;
  view: MoneyView;
  onGo: (view: MoneyView, extra?: Record<string, string>) => void;
  onBackHome: () => void;
}) {
  const { storeId, view, onGo, onBackHome } = props;
  const { safeT } = useI18n();
  const [loaded, setLoaded] = useState(false);
  const [revenue, setRevenue] = useState<RevenuePayload>({
    availableRevenue: 0,
    storeCashBalance: 0,
    openRecoveryAmount: 0,
    outstandingBalance: 0,
  });
  const [redemptions, setRedemptions] = useState<OwnerGiftRedemptionRow[]>([]);
  const [conversions, setConversions] = useState<OwnerGiftConversionRow[]>([]);
  const [amountStr, setAmountStr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRequestId, setLastRequestId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sid = storeId.trim();
    if (!sid) return;
    setLoaded(false);
    const [rRes, redRes, cRes] = await Promise.all([
      fetch(`/api/me/stores/${encodeURIComponent(sid)}/gift-certificates/revenue`, {
        credentials: "include",
        cache: "no-store",
      }),
      fetch(`/api/me/stores/${encodeURIComponent(sid)}/gift-certificates/redemptions`, {
        credentials: "include",
        cache: "no-store",
      }),
      fetch(`/api/me/stores/${encodeURIComponent(sid)}/gift-certificates/conversions`, {
        credentials: "include",
        cache: "no-store",
      }),
    ]);
    const rJson = (await rRes.json()) as {
      ok?: boolean;
      availableRevenue?: number;
      storeCashBalance?: number;
      openRecoveryAmount?: number;
      outstandingBalance?: number;
    };
    const redJson = (await redRes.json()) as { ok?: boolean; redemptions?: OwnerGiftRedemptionRow[] };
    const cJson = (await cRes.json()) as { ok?: boolean; conversions?: Record<string, unknown>[] };
    if (rJson.ok) {
      setRevenue({
        availableRevenue: Math.trunc(Number(rJson.availableRevenue) || 0),
        storeCashBalance: Math.trunc(Number(rJson.storeCashBalance) || 0),
        openRecoveryAmount: Math.trunc(Number(rJson.openRecoveryAmount) || 0),
        outstandingBalance: Math.trunc(Number(rJson.outstandingBalance) || 0),
      });
    }
    setRedemptions(redJson.ok ? redJson.redemptions ?? [] : []);
    setConversions(cJson.ok ? (cJson.conversions ?? []).map(mapConversion) : []);
    setLoaded(true);
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const redeemKpis = useMemo(() => aggregateOwnerRedemptionKpis(redemptions), [redemptions]);
  const pendingConv = useMemo(() => conversionPendingAmount(conversions), [conversions]);
  const gate = useMemo(
    () =>
      canRequestGiftCashConversion({
        availableRevenue: revenue.availableRevenue,
        openRecoveryAmount: revenue.openRecoveryAmount,
      }),
    [revenue.availableRevenue, revenue.openRecoveryAmount]
  );

  useEffect(() => {
    if (view === "convert" && gate.ok && !amountStr && revenue.availableRevenue > 0) {
      setAmountStr(String(revenue.availableRevenue));
    }
  }, [view, gate.ok, amountStr, revenue.availableRevenue]);

  const submitConversion = async () => {
    const sid = storeId.trim();
    if (!sid || busy) return;
    const validated = validateGiftConversionAmount({
      amount: Number(amountStr),
      availableRevenue: revenue.availableRevenue,
    });
    if (!validated.ok) {
      setError(
        validated.error === "exceeds_available"
          ? safeT("gift_u5_err_insufficient", {
              fallbackKo: "전환 가능한 상품권 수익이 부족합니다.",
              fallbackEn: "Not enough available gift revenue.",
            })
          : safeT("gift_u5_err_generic", {
              fallbackKo: "Cash 전환 신청에 실패했습니다. 다시 시도해 주세요.",
              fallbackEn: "Couldn’t submit the conversion request. Please try again.",
            })
      );
      return;
    }
    if (!gate.ok) {
      setError(
        gate.reason === "recovery_blocked"
          ? safeT("gift_u5_err_recovery", {
              fallbackKo: "정산 조정 금액이 있어 Cash 전환을 신청할 수 없습니다.",
              fallbackEn: "A settlement adjustment blocks cash conversion.",
            })
          : safeT("gift_u5_convert_blocked_none", {
              fallbackKo: "전환 가능한 상품권 수익이 없습니다.",
              fallbackEn: "No gift revenue available to convert.",
            })
      );
      return;
    }
    const confirmMsg = safeT("gift_u5_convert_confirm", {
      fallbackKo: `상품권 수익 ${formatMoneyPhp(validated.amount)}을 매장 Cash로 전환 신청할까요?`,
      fallbackEn: `Request converting gift revenue ${formatMoneyPhp(validated.amount)} to Store Cash?`,
    }).replace("{amount}", formatMoneyPhp(validated.amount));
    if (typeof window !== "undefined" && !window.confirm(confirmMsg)) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/me/stores/${encodeURIComponent(sid)}/gift-certificates/conversions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: validated.amount,
          idempotencyKey: `owner-gift-conv-${sid}-${validated.amount}-${Date.now()}`,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        request_id?: string;
        id?: string;
        conversion_request_id?: string;
      };
      if (!res.ok || !json.ok) {
        setError(mapHumanConversionError(String(json.error ?? ""), safeT));
        return;
      }
      const rid = String(json.request_id ?? json.conversion_request_id ?? json.id ?? "").trim();
      setLastRequestId(rid || null);
      await load();
      onGo("convert-success", rid ? { requestId: rid } : undefined);
    } finally {
      setBusy(false);
    }
  };

  const kpiCard = (label: string, value: string, testId: string) => (
    <div
      className="rounded-ui-rect border border-sam-border bg-sam-surface p-3"
      data-owner-gift-kpi={testId}
    >
      <p className="text-xs text-sam-muted">{label}</p>
      <p className="mt-1 text-base font-semibold tabular-nums break-words">{value}</p>
    </div>
  );

  if (view === "redemptions") {
    return (
      <OwnerStoreAdminDashSection
        title={safeT("gift_u5_redemptions_title", {
          fallbackKo: "상품권 사용 내역",
          fallbackEn: "Gift redemptions",
        })}
      >
        <button type="button" className={`${OWNER_ADMIN_OUTLINE_BTN_CLASS} mb-3`} onClick={() => onGo("money")}>
          ←
        </button>
        {!loaded ? (
          <p className="text-sm text-sam-muted">…</p>
        ) : redemptions.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-sam-muted">
              {safeT("gift_u5_redemptions_empty", {
                fallbackKo: "아직 사용된 상품권이 없습니다.",
                fallbackEn: "No gift redemptions yet.",
              })}
            </p>
            <button type="button" className={OWNER_ADMIN_PRIMARY_BTN_CLASS} onClick={onBackHome}>
              {safeT("gift_owner_cta_apply", {
                fallbackKo: "상품권 판매 신청",
                fallbackEn: "Apply to sell gift certificates",
              })}
            </button>
          </div>
        ) : (
          <ul className="space-y-2" data-owner-gift-redemption-list="1">
            {redemptions.map((row) => {
              const open = expandedId === row.id;
              const statusKey = ownerRedemptionStatusLabelKey(row);
              return (
                <li key={row.id} className={OWNER_ADMIN_LIST_CARD_CLASS} data-redemption-id={row.id} data-order-id={row.orderId}>
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => setExpandedId(open ? null : row.id)}
                  >
                    <p className="truncate text-sm font-semibold">{row.giftTitle || "Gift"}</p>
                    <p className="mt-1 text-xs text-sam-muted tabular-nums">
                      {row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}
                    </p>
                    <div className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-3">
                      <span>
                        {safeT("gift_u5_used", { fallbackKo: "사용 금액", fallbackEn: "Redeemed" })}:{" "}
                        <strong className="tabular-nums">{formatMoneyPhp(row.redeemedAmount)}</strong>
                      </span>
                      <span>
                        {safeT("gift_u5_fee", { fallbackKo: "DIBAY 수수료", fallbackEn: "DIBAY fee" })}:{" "}
                        <strong className="tabular-nums">{formatMoneyPhp(row.platformFeeAmount)}</strong>
                      </span>
                      <span>
                        {safeT("gift_u5_net", { fallbackKo: "내 수익", fallbackEn: "Your net" })}:{" "}
                        <strong className="tabular-nums">{formatMoneyPhp(row.merchantNetAmount)}</strong>
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-sam-muted">
                      {safeT(statusKey as MessageKey, {
                        fallbackKo: row.reversed ? "환불 복구" : "사용 완료",
                        fallbackEn: row.reversed ? "Refund restored" : "Redeemed",
                      })}
                    </p>
                  </button>
                  {open ? (
                    <div className="mt-3 border-t border-sam-border pt-3 text-xs space-y-1" data-redemption-detail="1">
                      <p>
                        Order: <span className="font-mono break-all">{row.orderNo || row.orderId}</span>
                      </p>
                      <p>
                        Gift: <span className="font-mono break-all">{row.instanceId}</span>
                      </p>
                      <Link
                        href={`${OwnerRoutes.orders(storeId)}${OwnerRoutes.orders(storeId).includes("?") ? "&" : "?"}order_id=${encodeURIComponent(row.orderId)}`}
                        className={`${OWNER_ADMIN_OUTLINE_BTN_CLASS} mt-2 inline-flex`}
                      >
                        {safeT("gift_u5_cta_order", { fallbackKo: "주문 보기", fallbackEn: "View order" })}
                      </Link>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </OwnerStoreAdminDashSection>
    );
  }

  if (view === "convert") {
    const amt = Math.trunc(Number(amountStr) || 0);
    const after = Math.max(0, revenue.availableRevenue - Math.max(0, amt));
    return (
      <OwnerStoreAdminDashSection
        title={safeT("gift_u5_convert_title", {
          fallbackKo: "Cash 전환 신청",
          fallbackEn: "Request cash conversion",
        })}
      >
        <button type="button" className={`${OWNER_ADMIN_OUTLINE_BTN_CLASS} mb-3`} onClick={() => onGo("money")}>
          ←
        </button>
        {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
        {!gate.ok ? (
          <p className="mb-3 text-sm text-sam-muted">
            {gate.reason === "recovery_blocked"
              ? safeT("gift_u5_convert_blocked_recovery", {
                  fallbackKo: "정산 조정 금액이 있어 Cash 전환을 신청할 수 없습니다.",
                  fallbackEn: "A settlement adjustment blocks cash conversion.",
                })
              : safeT("gift_u5_convert_blocked_none", {
                  fallbackKo: "전환 가능한 상품권 수익이 없습니다.",
                  fallbackEn: "No gift revenue available to convert.",
                })}
          </p>
        ) : null}
        <div className="space-y-3" data-owner-gift-convert-form="1">
          <p className="text-sm">
            {safeT("gift_u5_convert_available", {
              fallbackKo: "사용 가능한 상품권 수익",
              fallbackEn: "Available gift revenue",
            })}
            : <strong className="tabular-nums">{formatMoneyPhp(revenue.availableRevenue)}</strong>
          </p>
          <p className="text-sm">
            {safeT("gift_u5_convert_cash_now", {
              fallbackKo: "현재 매장 Cash",
              fallbackEn: "Current Store Cash",
            })}
            : <strong className="tabular-nums">{formatMoneyPhp(revenue.storeCashBalance)}</strong>
          </p>
          <label className="block text-sm">
            <span className="mb-1 block text-sam-muted">
              {safeT("gift_u5_convert_amount", {
                fallbackKo: "전환할 금액",
                fallbackEn: "Amount to convert",
              })}
            </span>
            <input
              inputMode="numeric"
              className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 tabular-nums"
              value={amountStr}
              disabled={!gate.ok || busy}
              onChange={(e) => setAmountStr(e.target.value.replace(/[^\d]/g, ""))}
            />
          </label>
          <p className="text-xs text-sam-muted">
            {safeT("gift_u5_convert_after", {
              fallbackKo: "전환 신청 후 남은 수익(예상)",
              fallbackEn: "Estimated revenue left after request",
            })}
            : <span className="tabular-nums">{formatMoneyPhp(after)}</span>
          </p>
          <button
            type="button"
            className={`${Sam.btn.primary} min-h-[48px] w-full`}
            disabled={!gate.ok || busy}
            onClick={() => void submitConversion()}
            data-owner-gift-convert-submit="1"
          >
            {safeT("gift_u5_convert_submit", {
              fallbackKo: "Cash 전환 신청",
              fallbackEn: "Request cash conversion",
            })}
          </button>
        </div>
      </OwnerStoreAdminDashSection>
    );
  }

  if (view === "convert-success") {
    return (
      <OwnerStoreAdminDashSection
        title={safeT("gift_u5_convert_success_title", {
          fallbackKo: "Cash 전환 신청이 접수되었습니다.",
          fallbackEn: "Cash conversion request submitted.",
        })}
      >
        <p className="text-sm font-medium" data-owner-gift-convert-success="1">
          {safeT("gift_u5_convert_success_status", {
            fallbackKo: "Admin 승인 대기",
            fallbackEn: "Awaiting admin approval",
          })}
        </p>
        {lastRequestId ? (
          <p className="mt-2 text-xs text-sam-muted font-mono break-all">ID: {lastRequestId}</p>
        ) : null}
        <div className="mt-4 flex flex-col gap-2">
          <button type="button" className={OWNER_ADMIN_PRIMARY_BTN_CLASS} onClick={() => onGo("convert-history")}>
            {safeT("gift_u5_cta_history", {
              fallbackKo: "전환 내역 보기",
              fallbackEn: "View conversion history",
            })}
          </button>
          <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={() => onGo("money")}>
            ←
          </button>
        </div>
      </OwnerStoreAdminDashSection>
    );
  }

  if (view === "convert-history") {
    return (
      <OwnerStoreAdminDashSection
        title={safeT("gift_u5_conv_history_title", {
          fallbackKo: "Cash 전환 내역",
          fallbackEn: "Cash conversion history",
        })}
      >
        <button type="button" className={`${OWNER_ADMIN_OUTLINE_BTN_CLASS} mb-3`} onClick={() => onGo("money")}>
          ←
        </button>
        {conversions.length === 0 ? (
          <p className="text-sm text-sam-muted">—</p>
        ) : (
          <ul className="space-y-2" data-owner-gift-conversion-history="1">
            {conversions.map((c) => {
              const sk = ownerConversionRequestStatusLabelKey(c.status);
              return (
                <li key={c.id} className={OWNER_ADMIN_LIST_CARD_CLASS} data-conversion-id={c.id}>
                  <p className="text-sm font-semibold tabular-nums">{formatMoneyPhp(c.amount)}</p>
                  <p className="mt-1 text-xs text-sam-muted">
                    {c.createdAt ? new Date(c.createdAt).toLocaleString() : "—"}
                  </p>
                  <p className="mt-1 text-xs">
                    {safeT(sk as MessageKey, {
                      fallbackKo: c.status,
                      fallbackEn: c.status,
                    })}
                  </p>
                  {c.approvedAt ? (
                    <p className="mt-1 text-xs text-sam-muted">
                      {new Date(c.approvedAt).toLocaleString()}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </OwnerStoreAdminDashSection>
    );
  }

  // money home
  return (
    <div className="space-y-4" data-owner-gift-money="1">
      <OwnerStoreAdminDashSection
        title={safeT("gift_u5_money_title", {
          fallbackKo: "상품권 수익·Cash",
          fallbackEn: "Gift revenue & cash",
        })}
      >
        <button type="button" className={`${OWNER_ADMIN_OUTLINE_BTN_CLASS} mb-3`} onClick={onBackHome}>
          ←
        </button>
        {!loaded ? (
          <p className="text-sm text-sam-muted">…</p>
        ) : (
          <>
            {revenue.openRecoveryAmount > 0 ? (
              <p className="mb-3 text-sm text-amber-700" data-owner-gift-recovery="1">
                {safeT("gift_u5_recovery_notice", {
                  fallbackKo: "환불로 인해 정산 조정 금액이 있습니다.",
                  fallbackEn: "There is a settlement adjustment from a refund.",
                })}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              {kpiCard(
                safeT("gift_u5_kpi_outstanding", {
                  fallbackKo: "미사용 상품권 잔액",
                  fallbackEn: "Unused gift balance",
                }),
                formatMoneyPhp(revenue.outstandingBalance),
                "outstanding"
              )}
              {kpiCard(
                safeT("gift_u5_kpi_redeemed", {
                  fallbackKo: "사용된 상품권 금액",
                  fallbackEn: "Redeemed gift amount",
                }),
                formatMoneyPhp(redeemKpis.redeemedGross),
                "redeemed"
              )}
              {kpiCard(
                safeT("gift_u5_kpi_fee", { fallbackKo: "DIBAY 수수료", fallbackEn: "DIBAY fee" }),
                formatMoneyPhp(redeemKpis.platformFeeTotal),
                "fee"
              )}
              {kpiCard(
                safeT("gift_u5_kpi_merchant_net", {
                  fallbackKo: "내 상품권 수익",
                  fallbackEn: "Your gift revenue",
                }),
                formatMoneyPhp(redeemKpis.merchantNetTotal),
                "merchant-net"
              )}
              {kpiCard(
                safeT("gift_u5_kpi_available", {
                  fallbackKo: "전환 가능 수익",
                  fallbackEn: "Available to convert",
                }),
                formatMoneyPhp(revenue.availableRevenue),
                "available"
              )}
              {kpiCard(
                safeT("gift_u5_kpi_cash_pending", {
                  fallbackKo: "Cash 전환 대기",
                  fallbackEn: "Cash conversion pending",
                }),
                formatMoneyPhp(pendingConv),
                "cash-pending"
              )}
              {kpiCard(
                safeT("gift_u5_kpi_store_cash", { fallbackKo: "매장 Cash", fallbackEn: "Store Cash" }),
                formatMoneyPhp(revenue.storeCashBalance),
                "store-cash"
              )}
            </div>
            <p className="mt-3 text-xs text-sam-muted">
              {safeT("gift_u5_money_hint_credit", {
                fallbackKo: "비즈니스 크레딧은 운영용이며, 상품권 수익·매장 Cash와 다른 돈입니다.",
                fallbackEn:
                  "Business credit is for operations and is separate from gift revenue and Store Cash.",
              })}
            </p>
            {redeemKpis.redeemedGross <= 0 && revenue.availableRevenue <= 0 ? (
              <p className="mt-3 text-sm text-sam-muted">
                {safeT("gift_u5_revenue_empty", {
                  fallbackKo: "아직 발생한 상품권 수익이 없습니다.",
                  fallbackEn: "No gift revenue yet.",
                })}
              </p>
            ) : null}
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={() => onGo("redemptions")}>
                {safeT("gift_u5_cta_redemptions", {
                  fallbackKo: "사용 내역",
                  fallbackEn: "Redemption history",
                })}
              </button>
              {gate.ok ? (
                <button
                  type="button"
                  className={`${Sam.btn.primary} min-h-[48px] w-full`}
                  onClick={() => onGo("convert")}
                  data-owner-gift-convert-cta="1"
                >
                  {safeT("gift_u5_cta_convert", {
                    fallbackKo: "Cash 전환 신청",
                    fallbackEn: "Request cash conversion",
                  })}
                </button>
              ) : (
                <p className="text-xs text-sam-muted" data-owner-gift-convert-blocked="1">
                  {gate.reason === "recovery_blocked"
                    ? safeT("gift_u5_convert_blocked_recovery", {
                        fallbackKo: "정산 조정 금액이 있어 Cash 전환을 신청할 수 없습니다.",
                        fallbackEn: "A settlement adjustment blocks cash conversion.",
                      })
                    : safeT("gift_u5_convert_blocked_none", {
                        fallbackKo: "전환 가능한 상품권 수익이 없습니다.",
                        fallbackEn: "No gift revenue available to convert.",
                      })}
                </p>
              )}
              <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={() => onGo("convert-history")}>
                {safeT("gift_u5_cta_history", {
                  fallbackKo: "전환 내역 보기",
                  fallbackEn: "View conversion history",
                })}
              </button>
              <Link href={OwnerRoutes.points(storeId)} className={`${OWNER_ADMIN_OUTLINE_BTN_CLASS} text-center`}>
                {safeT("gift_u5_link_business_credit", {
                  fallbackKo: "비즈니스 크레딧(운영용) 보기",
                  fallbackEn: "View business credit (operations)",
                })}
              </Link>
            </div>
          </>
        )}
      </OwnerStoreAdminDashSection>
    </div>
  );
}
