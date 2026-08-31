"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { useOwnerAdminBottomSheetKeyboard } from "@/lib/business/use-owner-admin-bottom-sheet-keyboard";
import {
  DELIVERY_AD_CASH_CHARGE_PRESETS_MAJOR,
} from "@/lib/stores/advertising/delivery-ad-product-recovery-contract";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import { DELIVERY_AD_OWNER_PRIMARY_BTN_CLASS } from "@/lib/stores/advertising/delivery-ad-owner-ui-presentation";

type ChargeRequest = {
  id: string;
  amountMinor: number;
  requestStatus: string;
  createdAt: string;
};

export function OwnerDeliveryAdCashChargeSheet({
  open,
  onClose,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const { t, safeT } = useI18n();
  const { contentPaddingBottomPx } = useOwnerAdminBottomSheetKeyboard(open);
  const [amountMajor, setAmountMajor] = useState<number>(DELIVERY_AD_CASH_CHARGE_PRESETS_MAJOR[0]!);
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<ChargeRequest[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/me/delivery-ads/business-cash/charge-requests", {
        credentials: "include",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        requests?: ChargeRequest[];
      };
      if (res.ok && json.ok) setRequests(json.requests ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/delivery-ads/business-cash/charge-requests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountMajor,
          ownerMemo: memo.trim() || null,
          clientRequestId: `cash-${Date.now()}`,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error || "generic");
        return;
      }
      setMemo("");
      await load();
      onSubmitted?.();
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DibayBottomSheet
      open={open}
      onClose={onClose}
      title={safeT("owner_ads_cash_charge_title", {
        fallbackKo: "Business Cash 충전 신청",
        fallbackEn: "Request Business Cash top-up",
      })}
      anchor="above-bottom-nav"
      ariaLabel={safeT("owner_ads_cash_charge_title", {
        fallbackKo: "Business Cash 충전 신청",
        fallbackEn: "Request Business Cash top-up",
      })}
      panelClassName="!max-w-md"
      contentPaddingBottomPx={contentPaddingBottomPx}
    >
      <div className="mt-3 space-y-4" data-owner-ads-cash-charge="sheet">
        <p className="text-[13px] text-sam-muted">
          {safeT("owner_ads_cash_charge_help", {
            fallbackKo:
              "입금 후 관리자가 확인하면 광고 Business Cash에 적립됩니다. Business Credit과는 별도입니다.",
            fallbackEn:
              "After deposit, admin confirms and credits ads Business Cash. Separate from Business Credit.",
          })}
        </p>
        <div className="flex flex-wrap gap-2">
          {DELIVERY_AD_CASH_CHARGE_PRESETS_MAJOR.map((n) => (
            <button
              key={n}
              type="button"
              className={`min-h-[40px] rounded-ui-rect border px-3 text-[13px] font-semibold ${
                amountMajor === n
                  ? "border-[#0A823E] bg-[#E8F5EE] text-[#0A823E]"
                  : "border-[#BDBDBD] text-sam-fg"
              }`}
              onClick={() => setAmountMajor(n)}
              data-owner-ads-cash-preset={n}
            >
              ₱{n.toLocaleString()}
            </button>
          ))}
        </div>
        <label className="block text-[12px] font-medium text-sam-muted">
          {safeT("owner_ads_cash_charge_memo", {
            fallbackKo: "메모 (선택)",
            fallbackEn: "Memo (optional)",
          })}
          <textarea
            className="mt-1 w-full rounded-ui-rect border border-[#BDBDBD] px-3 py-2 text-[14px] text-sam-fg"
            rows={2}
            value={memo}
            onChange={(e) => setMemo(e.target.value.slice(0, 200))}
          />
        </label>
        {error ? (
          <p className="text-[13px] text-red-600" role="alert">
            {safeT("owner_ads_error_generic", {
              fallbackKo: "처리에 실패했습니다. 다시 시도해 주세요.",
              fallbackEn: "Something went wrong. Please try again.",
            })}
          </p>
        ) : null}
        <button
          type="button"
          className={`${DELIVERY_AD_OWNER_PRIMARY_BTN_CLASS} w-full`}
          disabled={busy}
          onClick={() => void submit()}
          data-owner-ads-cash-charge-submit="1"
        >
          {busy
            ? t("owner_ads_loading")
            : safeT("owner_ads_cash_charge_submit", {
                fallbackKo: "충전 신청",
                fallbackEn: "Submit top-up request",
              })}
        </button>
        {requests.length > 0 ? (
          <ul className="space-y-2 border-t border-[#E0E0E0] pt-3" data-owner-ads-cash-charge-list="1">
            {requests.slice(0, 5).map((r) => (
              <li key={r.id} className="flex justify-between gap-2 text-[12px] text-sam-muted">
                <span>{formatDeliveryAdPhpMinor(r.amountMinor)}</span>
                <span>{r.requestStatus}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </DibayBottomSheet>
  );
}
