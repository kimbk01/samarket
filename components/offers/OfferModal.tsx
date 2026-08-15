"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useEffect, useState } from "react";
import { formatPrice, formatPriceInput } from "@/lib/utils/format";
import type { PriceOfferListItem } from "@/lib/offers/types";
import { DibayBottomSheet, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

type Props = {
  open: boolean;
  productId: string;
  originalPrice: number;
  currency: string;
  /** 페이스북 마켓플레이스처럼 상단에 상품 맥락 줄 */
  productTitle?: string | null;
  onClose: () => void;
  onSubmitted?: (offer: PriceOfferListItem) => void;
};

export function OfferModal({
  open,
  productId,
  originalPrice,
  currency,
  productTitle,
  onClose,
  onSubmitted,
}: Props) {
  const { t } = useI18n();
  const [offeredPrice, setOfferedPrice] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setOfferedPrice("");
    setMessage("");
    setError("");
    setBusy(false);
  }, [open]);

  const minAllowed = Math.ceil(originalPrice * 0.5);
  const titleTrim = typeof productTitle === "string" ? productTitle.trim() : "";

  const submit = async () => {
    const digits = offeredPrice.replace(/\D/g, "");
    const nextPrice = digits ? Number(digits) : NaN;
    if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
      setError(t("ui_offer_price_required"));
      return;
    }
    if (nextPrice < minAllowed) {
      setError(t("ui_offer_min_price", { min: formatPrice(minAllowed, currency) }));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/offers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          offeredPrice: nextPrice,
          message: message.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        offer?: PriceOfferListItem;
      };
      if (!res.ok || !json?.ok || !json.offer) {
        setError(typeof json?.error === "string" ? json.error : t("ui_offer_send_failed"));
        return;
      }
      onSubmitted?.(json.offer);
      onClose();
    } catch {
      setError(t("ui_offer_network_error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DibayBottomSheet
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={t("ui_offer_submit_label")}
      anchor="above-bottom-nav"
      footer={
        <div className="mt-2 border-t border-[color:var(--overlay-border)] pt-3">
          <DibayOverlayButton roleTone="primary" disabled={busy} loading={busy} onClick={() => void submit()}>
            {busy ? t("ui_offer_submitting") : t("ui_offer_send_action")}
          </DibayOverlayButton>
          <div className="mt-2">
            <DibayOverlayButton roleTone="text" disabled={busy} onClick={onClose}>
              {t("common_cancel")}
            </DibayOverlayButton>
          </div>
        </div>
      }
    >
      {titleTrim.length > 0 ? (
        <div className="mb-3 rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] px-3 py-2.5">
          <p className="truncate text-sm font-semibold text-[color:var(--overlay-text-primary)]">{titleTrim}</p>
          <p className={`mt-0.5 ${OverlayUi.caption}`}>
            {t("ui_offer_sale_label")}{" "}
            <span className="font-semibold text-[color:var(--overlay-text-primary)]">
              {formatPrice(originalPrice, currency)}
            </span>
            {" · "}
            {t("ui_offer_min_offer_label")} {formatPrice(minAllowed, currency)}
          </p>
        </div>
      ) : (
        <p className={`mb-3 ${OverlayUi.bodySecondary}`}>
          {t("ui_offer_context_line_long", {
            sale: formatPrice(originalPrice, currency),
            min: formatPrice(minAllowed, currency),
          })}
        </p>
      )}

      <p className={`mb-4 ${OverlayUi.caption}`}>{t("ui_offer_limit_rules")}</p>

      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-[color:var(--overlay-text-primary)]">
            {t("ui_offer_price_label")}
          </span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={offeredPrice}
            onChange={(e) => setOfferedPrice(formatPriceInput(e.target.value))}
            placeholder={formatPriceInput(String(minAllowed))}
            className="w-full rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] px-3.5 py-3 text-[15px] outline-none"
            disabled={busy}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-[color:var(--overlay-text-primary)]">
            {t("ui_offer_message_optional")}
          </span>
          <textarea
            rows={4}
            maxLength={500}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("ui_offer_message_ph")}
            className="w-full resize-none rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] px-3.5 py-3 text-[15px] outline-none"
            disabled={busy}
          />
          <span className={`mt-1 block text-right ${OverlayUi.caption}`}>{message.length}/500</span>
        </label>

        {error ? (
          <p className="rounded-[length:var(--overlay-radius-md)] bg-red-50 px-3 py-2 text-sm text-[color:var(--overlay-danger)]">
            {error}
          </p>
        ) : null}
      </div>
    </DibayBottomSheet>
  );
}
