"use client";

/**
 * Stage 1 — minimal Owner finance surface for AST-005 Business Cash + SP→BC conversion.
 * Not a full Ads Hub rebuild.
 */

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import { catalogDateLocale } from "@/lib/i18n/catalog-date-locale";
import { Sam } from "@/lib/ui/css-vars";

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

export function OwnerBusinessCashView({ storeId }: { storeId: string }) {
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
        safeT("owner_bc_topup_pending", {
          fallbackKo: "Business Cash 충전 신청이 접수되었습니다. 관리자 승인 후 반영됩니다.",
          fallbackEn: "Business Cash top-up requested. It applies after admin approval.",
        })
      );
      setTopUpAmountPhp("");
      await load();
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
          safeT("owner_bc_convert_invalid_points", {
            fallbackKo: "전환할 매장 포인트를 입력해 주세요",
            fallbackEn: "Enter Store Points to convert",
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
        safeT("owner_bc_convert_success", {
          fallbackKo: "매장 포인트가 Business Cash로 전환되었습니다.",
          fallbackEn: "Store Points converted to Business Cash.",
        })
      );
      setConvertPoints("");
      setQuote(null);
      await load();
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

      <OwnerStoreAdminDashSection
        title={safeT("owner_bc_title", {
          fallbackKo: "Business Cash",
          fallbackEn: "Business Cash",
        })}
      >
        <p className="text-2xl font-semibold text-sam-fg">
          {formatDeliveryAdPhpMinor(bcBalanceMinor)}
        </p>
        <p className="mt-1 text-sm text-sam-muted">
          {safeT("owner_bc_balance_hint", {
            fallbackKo: "광고·파트너 결제용 (이 매장)",
            fallbackEn: "For ads & partner spend (this store)",
          })}
        </p>
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection
        title={safeT("owner_sp_economic_title", {
          fallbackKo: "매장 포인트",
          fallbackEn: "Store Points",
        })}
      >
        <p className="text-xl font-semibold text-sam-fg">
          {spBalance.toLocaleString(locale)}
          {safeT("owner_sp_unit", { fallbackKo: "P", fallbackEn: "P" })}
        </p>
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection
        title={safeT("owner_bc_topup_title", {
          fallbackKo: "Business Cash 충전",
          fallbackEn: "Top up Business Cash",
        })}
      >
        <div className="flex gap-2">
          <input
            className={Sam.input.base}
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
            className={Sam.btn.primary}
            disabled={busy}
            onClick={() => void submitTopUp()}
          >
            {safeT("owner_bc_topup_submit", {
              fallbackKo: "충전 신청",
              fallbackEn: "Request top-up",
            })}
          </button>
        </div>
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection
        title={safeT("owner_bc_convert_title", {
          fallbackKo: "매장 포인트 → Business Cash",
          fallbackEn: "Store Points → Business Cash",
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
        <div className="flex gap-2">
          <input
            className={Sam.input.base}
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
            placeholder={safeT("owner_bc_convert_points_placeholder", {
              fallbackKo: "전환할 포인트",
              fallbackEn: "Points to convert",
            })}
          />
          <button
            type="button"
            className={Sam.btn.secondary}
            disabled={busy}
            onClick={() => void refreshQuote(Math.trunc(Number(convertPoints) || 0))}
          >
            {safeT("owner_bc_quote", { fallbackKo: "미리보기", fallbackEn: "Preview" })}
          </button>
        </div>
        {quote ? (
          <div className="mt-3 space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-sm">
            <p>
              {safeT("owner_bc_held_sp", {
                fallbackKo: "보유 매장 포인트",
                fallbackEn: "Store Points balance",
              })}
              {": "}
              {quote.storePointsBalance.toLocaleString(locale)}
            </p>
            <p>
              {safeT("owner_bc_convert_amount_sp", {
                fallbackKo: "전환할 매장 포인트",
                fallbackEn: "Points to convert",
              })}
              {": "}
              {quote.requestedPoints.toLocaleString(locale)}
            </p>
            <p>
              {safeT("owner_bc_expected_bc", {
                fallbackKo: "받을 Business Cash",
                fallbackEn: "Business Cash to receive",
              })}
              {": "}
              {formatDeliveryAdPhpMinor(quote.expectedBusinessCashMinor)}
            </p>
            {quote.rateChangedNoticeRequired ? (
              <p className="font-medium text-sam-danger" role="status">
                {safeT("owner_bc_rate_changed_notice", {
                  fallbackKo: `현재 전환율이 변경되었습니다. ${quote.requestedPoints} 매장 포인트를 전환하면 Business Cash ${formatDeliveryAdPhpMinor(quote.expectedBusinessCashMinor)}이 충전됩니다.`,
                  fallbackEn: `The conversion rate changed. Converting ${quote.requestedPoints} Store Points credits ${formatDeliveryAdPhpMinor(quote.expectedBusinessCashMinor)} Business Cash.`,
                })}
              </p>
            ) : null}
            <button
              type="button"
              className={Sam.btn.primary}
              disabled={busy}
              onClick={() => void submitConvert()}
            >
              {safeT("owner_bc_convert_confirm", {
                fallbackKo: "전환 확인",
                fallbackEn: "Confirm convert",
              })}
            </button>
          </div>
        ) : null}
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection
        title={safeT("owner_bc_history_title", {
          fallbackKo: "Business Cash 내역",
          fallbackEn: "Business Cash history",
        })}
      >
        {ledger.length === 0 ? (
          <p className="text-sm text-sam-muted">
            {safeT("owner_bc_history_empty", {
              fallbackKo: "내역이 없습니다",
              fallbackEn: "No history yet",
            })}
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {ledger.map((row) => (
              <li key={row.id} className="flex justify-between gap-2 border-b border-sam-border pb-2">
                <span>
                  {row.entryKind} · {row.direction}
                </span>
                <span>
                  {formatDeliveryAdPhpMinor(Math.trunc(Number(row.amountMinor) || 0))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </OwnerStoreAdminDashSection>

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
                <span className="text-sam-muted">{r.status}</span>
              </li>
            ))}
          </ul>
        </OwnerStoreAdminDashSection>
      ) : null}
    </div>
  );
}
