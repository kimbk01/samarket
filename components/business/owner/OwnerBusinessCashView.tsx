"use client";

/** Canonical Owner Cash top-up and Coin → Cash conversion controls. */

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { CurrencyBalanceCard, CurrencyHistoryRow } from "@/components/currency";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import { catalogDateLocale } from "@/lib/i18n/catalog-date-locale";
import { Sam } from "@/lib/ui/css-vars";
import {
  OWNER_FORM_ACTION_ROW_CLASS,
  OWNER_FORM_INPUT_GROW_CLASS,
  OwnerCta,
} from "@/lib/business/owner-cta-classes";

type Quote = {
  ratePesosPerPoint: number;
  version: number;
  isDefaultRate: boolean;
  storePointsBalance: number;
  businessCashBalanceMinor: number;
  requestedPoints: number;
  expectedBusinessCashMinor: number;
  rateChangedNoticeRequired: boolean;
};

type LedgerRow = {
  id: string;
  entryKind: string;
  direction?: string;
  amountMinor?: number;
  amount?: number;
  balanceAfterMinor?: number;
  balanceAfter?: number;
  createdAt: string;
};

export function OwnerBusinessCashView({
  storeId,
  manageOnly = false,
  onChanged,
}: {
  storeId: string;
  manageOnly?: boolean;
  onChanged?: () => void | Promise<void>;
}) {
  const { t, safeT, language } = useI18n();
  const locale = catalogDateLocale(language);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [spBalance, setSpBalance] = useState(0);
  const [bcBalanceMinor, setBcBalanceMinor] = useState(0);
  const [rate, setRate] = useState<{
    ratePesosPerPoint: number;
    version: number;
    isDefaultRate: boolean;
  } | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [topUps, setTopUps] = useState<
    Array<{ id: string; amountMinor: number; status: string; createdAt: string }>
  >([]);

  const [topUpAmountPhp, setTopUpAmountPhp] = useState("");
  const [convertPoints, setConvertPoints] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/business-cash`, {
        credentials: "include",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        assets?: {
          storePoints?: { balance?: number };
          businessCash?: { balanceMinor?: number };
        };
        conversion?: {
          ratePesosPerPoint?: number;
          version?: number;
          isDefaultRate?: boolean;
        } | null;
        businessCashLedger?: LedgerRow[];
        topUpRequests?: Array<{
          id: string;
          amountMinor: number;
          status: string;
          createdAt: string;
        }>;
      };
      if (!res.ok || json.ok === false) {
        setError(resolveOwnerApiErrorMessage(json.error, t));
        return;
      }
      setSpBalance(Math.trunc(Number(json.assets?.storePoints?.balance) || 0));
      setBcBalanceMinor(Math.trunc(Number(json.assets?.businessCash?.balanceMinor) || 0));
      if (json.conversion) {
        setRate({
          ratePesosPerPoint: Number(json.conversion.ratePesosPerPoint) || 1,
          version: Math.trunc(Number(json.conversion.version) || 1),
          isDefaultRate: json.conversion.isDefaultRate === true,
        });
      }
      setLedger(json.businessCashLedger ?? []);
      setTopUps(json.topUpRequests ?? []);
    } catch {
      setError(t("common_error"));
    } finally {
      setLoading(false);
    }
  }, [storeId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshQuote = async (points: number) => {
    const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/business-cash`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "quote",
        requestedPoints: points,
        previousRateVersion: rate?.version ?? null,
      }),
    });
    const json = (await res.json()) as { ok?: boolean; quote?: Quote; error?: string };
    if (!res.ok || !json.ok || !json.quote) {
      setError(resolveOwnerApiErrorMessage(json.error, t));
      return null;
    }
    setQuote(json.quote);
    setRate({
      ratePesosPerPoint: json.quote.ratePesosPerPoint,
      version: json.quote.version,
      isDefaultRate: json.quote.isDefaultRate,
    });
    return json.quote;
  };

  const submitTopUp = async () => {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const php = Math.trunc(Number(topUpAmountPhp) || 0);
      if (php <= 0) {
        setError(
          safeT("owner_bc_topup_invalid_amount", {
            fallbackKo: "충전 금액을 입력해 주세요",
            fallbackEn: "Enter a top-up amount",
          })
        );
        return;
      }
      const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/business-cash`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "topup_request",
          amountMinor: php * 100,
          idempotencyKey: `bc_topup:${storeId}:${php}:${Date.now()}`,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) {
        setError(resolveOwnerApiErrorMessage(json.error, t));
        return;
      }
      setNotice(
        safeT("owner_finance_cash_topup_pending", {
          fallbackKo: "캐시 충전 신청이 접수되었습니다. 관리자 승인 후 반영됩니다.",
          fallbackEn: "Cash top-up requested. It applies after admin approval.",
        })
      );
      setTopUpAmountPhp("");
      await load();
      await onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const submitConvert = async () => {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const points = Math.trunc(Number(convertPoints) || 0);
      const q = quote ?? (await refreshQuote(points));
      if (!q || points <= 0) {
        setError(
          safeT("owner_finance_cash_convert_invalid", {
            fallbackKo: "전환할 Coin을 입력해 주세요.",
            fallbackEn: "Enter Coin to convert.",
          })
        );
        return;
      }
      const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/business-cash`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "convert",
          points,
          expectedRateVersion: q.version,
          idempotencyKey: `sp2bc:${storeId}:${points}:${q.version}:${Date.now()}`,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        ratePesosPerPoint?: number;
        version?: number;
      };
      if (!res.ok || json.ok === false) {
        if (json.error === "stale_rate") {
          setNotice(
            safeT("owner_bc_stale_rate", {
              fallbackKo: "전환율이 변경되었습니다. 새 전환율을 확인한 뒤 다시 확인해 주세요.",
              fallbackEn: "The conversion rate changed. Review the new rate and confirm again.",
            })
          );
          await refreshQuote(points);
          return;
        }
        setError(resolveOwnerApiErrorMessage(json.error, t));
        return;
      }
      setNotice(
        safeT("owner_finance_cash_convert_success", {
          fallbackKo: "Coin이 캐시로 전환되었습니다.",
          fallbackEn: "Coin converted to Cash.",
        })
      );
      setConvertPoints("");
      setQuote(null);
      await load();
      await onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-sam-muted">{t("common_loading")}</p>;
  }

  return (
    <div className="space-y-4" data-owner-business-cash="stage1">
      {error ? <p className="text-sm text-sam-danger">{error}</p> : null}
      {notice ? <p className="text-sm text-sam-fg">{notice}</p> : null}

      {!manageOnly ? (
        <>
          <CurrencyBalanceCard currency="cash" amount={bcBalanceMinor} isMinor />
          <OwnerStoreAdminDashSection
            title={safeT("owner_finance_coin_balance", {
              fallbackKo: "Coin 잔액",
              fallbackEn: "Coin balance",
            })}
          >
            <p className="text-xl font-semibold text-sam-fg">
              {spBalance.toLocaleString(locale)} Coin
            </p>
          </OwnerStoreAdminDashSection>
        </>
      ) : null}

      <OwnerStoreAdminDashSection
        title={safeT("owner_finance_cash_topup_title", {
          fallbackKo: "캐시 충전",
          fallbackEn: "Top up Cash",
        })}
      >
        <div className={OWNER_FORM_ACTION_ROW_CLASS}>
          <input
            className={`${Sam.input.base} ${OWNER_FORM_INPUT_GROW_CLASS}`}
            inputMode="numeric"
            value={topUpAmountPhp}
            onChange={(e) => setTopUpAmountPhp(e.target.value)}
            placeholder={safeT("owner_bc_topup_placeholder", {
              fallbackKo: "금액 (₱)",
              fallbackEn: "Amount (₱)",
            })}
          />
          <button
            type="button"
            className={OwnerCta.formPrimary}
            disabled={busy}
            onClick={() => void submitTopUp()}
            data-owner-cta="primary"
          >
            {safeT("owner_bc_topup_submit", {
              fallbackKo: "충전 신청",
              fallbackEn: "Request top-up",
            })}
          </button>
        </div>
      </OwnerStoreAdminDashSection>

      <div id="convert" data-owner-bc-convert="1">
      <OwnerStoreAdminDashSection
        title={safeT("owner_finance_cash_convert_title", {
          fallbackKo: "Coin → 캐시",
          fallbackEn: "Coin → Cash",
        })}
      >
        <p className="mb-2 text-sm text-sam-muted">
          {safeT("owner_bc_rate_label", {
            fallbackKo: "현재 전환율",
            fallbackEn: "Current rate",
          })}
          {": "}
          {rate
            ? `1 : ${rate.ratePesosPerPoint}`
            : safeT("owner_bc_rate_unknown", {
                fallbackKo: "확인 중",
                fallbackEn: "Loading",
              })}
          {rate?.isDefaultRate
            ? ` (${safeT("owner_bc_rate_default", {
                fallbackKo: "기본 1:1",
                fallbackEn: "default 1:1",
              })})`
            : ""}
        </p>
        <div className={OWNER_FORM_ACTION_ROW_CLASS}>
          <input
            className={`${Sam.input.base} ${OWNER_FORM_INPUT_GROW_CLASS}`}
            inputMode="numeric"
            value={convertPoints}
            onChange={(e) => {
              setConvertPoints(e.target.value);
              setQuote(null);
            }}
            onBlur={() => {
              const p = Math.trunc(Number(convertPoints) || 0);
              if (p > 0) void refreshQuote(p);
            }}
            placeholder={safeT("owner_finance_cash_convert_placeholder", {
              fallbackKo: "전환할 Coin",
              fallbackEn: "Coin to convert",
            })}
          />
          <button
            type="button"
            className={OwnerCta.formSecondary}
            disabled={busy}
            onClick={() => void refreshQuote(Math.trunc(Number(convertPoints) || 0))}
            data-owner-cta="secondary"
          >
            {safeT("owner_bc_quote", { fallbackKo: "미리보기", fallbackEn: "Preview" })}
          </button>
        </div>
        {quote ? (
          <div className="mt-3 space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-sm">
            <p>
              {safeT("owner_finance_coin_held", {
                fallbackKo: "보유 Coin",
                fallbackEn: "Coin balance",
              })}
              {": "}
              {quote.storePointsBalance.toLocaleString(locale)}
            </p>
            <p>
              {safeT("owner_finance_cash_convert_amount", {
                fallbackKo: "전환할 Coin",
                fallbackEn: "Coin to convert",
              })}
              {": "}
              {quote.requestedPoints.toLocaleString(locale)}
            </p>
            <p>
              {safeT("owner_finance_cash_expected", {
                fallbackKo: "받을 캐시",
                fallbackEn: "Cash to receive",
              })}
              {": "}
              {formatDeliveryAdPhpMinor(quote.expectedBusinessCashMinor)}
            </p>
            {quote.rateChangedNoticeRequired ? (
              <p className="font-medium text-sam-danger" role="status">
                {safeT("owner_finance_cash_rate_changed", {
                  fallbackKo: "현재 전환율이 변경되었습니다. 새 전환율을 확인해 주세요.",
                  fallbackEn: "The conversion rate changed. Review the new rate.",
                })}
              </p>
            ) : null}
            <button
              type="button"
              className={`${OwnerCta.formPrimary} ${OwnerCta.block}`}
              disabled={busy}
              onClick={() => void submitConvert()}
              data-owner-cta="primary"
            >
              {safeT("owner_bc_convert_confirm", {
                fallbackKo: "전환 확인",
                fallbackEn: "Confirm convert",
              })}
            </button>
          </div>
        ) : null}
      </OwnerStoreAdminDashSection>
      </div>

      {!manageOnly ? (
        <OwnerStoreAdminDashSection
          title={safeT("owner_finance_cash_history_title", {
            fallbackKo: "캐시 내역",
            fallbackEn: "Cash history",
          })}
        >
        <div id="ledger" data-owner-bc-ledger="1">
        {ledger.length === 0 ? (
          <p className="text-sm text-sam-muted">
            {safeT("owner_bc_history_empty", {
              fallbackKo: "내역이 없습니다",
              fallbackEn: "No history yet",
            })}
          </p>
        ) : (
          <ul className="space-y-2">
            {ledger.map((row) => (
              <CurrencyHistoryRow
                key={row.id}
                currency="cash"
                title={row.entryKind}
                amount={Math.trunc(Number(row.amountMinor) || 0)}
                isMinor
                createdAt={row.createdAt}
              />
            ))}
          </ul>
        )}
        </div>
        </OwnerStoreAdminDashSection>
      ) : null}

      {topUps.length > 0 ? (
        <OwnerStoreAdminDashSection
          title={safeT("owner_bc_topup_history_title", {
            fallbackKo: "충전 신청",
            fallbackEn: "Top-up requests",
          })}
        >
          <ul className="space-y-2 text-sm">
            {topUps.map((r) => (
              <li key={r.id} className="flex justify-between gap-2">
                <span>{formatDeliveryAdPhpMinor(r.amountMinor)}</span>
                <span className="text-sam-muted">
                  {r.status === "approved"
                    ? safeT("owner_finance_cash_topup_status_approved", {
                        fallbackKo: "충전 완료",
                        fallbackEn: "Completed",
                      })
                    : r.status === "rejected"
                      ? safeT("owner_finance_cash_topup_status_rejected", {
                          fallbackKo: "거절",
                          fallbackEn: "Rejected",
                        })
                      : safeT("owner_finance_cash_topup_status_pending", {
                          fallbackKo: "처리 중",
                          fallbackEn: "Processing",
                        })}
                </span>
              </li>
            ))}
          </ul>
        </OwnerStoreAdminDashSection>
      ) : null}
    </div>
  );
}
