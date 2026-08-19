"use client";

import { useMemo, useState } from "react";
import type { PublicReviewType } from "@/lib/types/daangn";
import {
  BUYER_TO_SELLER_NEGATIVE,
  BUYER_TO_SELLER_POSITIVE,
  sanitizeReviewComment,
  tradeReviewTagLabel,
} from "@/lib/trade/trade-review-tags";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

const PUBLIC_TYPES: PublicReviewType[] = ["good", "normal", "bad"];

function publicTypeLabel(t: ReturnType<typeof useI18n>["t"], type: PublicReviewType): string {
  if (type === "good") return t("trade_review_public_good");
  if (type === "bad") return t("trade_review_public_bad");
  return t("trade_review_public_normal");
}

export function TradeReviewWriteSheet({
  productChatId,
  sellerId,
  sellerLabel,
  onClose,
  onSubmitted,
}: {
  productChatId: string;
  sellerId: string;
  sellerLabel: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const { t } = useI18n();
  const [publicType, setPublicType] = useState<PublicReviewType>("good");
  const [positiveKeys, setPositiveKeys] = useState<string[]>([]);
  const [negativeKeys, setNegativeKeys] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [anonymousNegative, setAnonymousNegative] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showPositive = publicType === "good" || publicType === "normal";
  const showNegative = publicType === "bad" || publicType === "normal";

  const heading = useMemo(
    () => t("trade_review_form_heading", { name: sellerLabel || t("mypage_comp_actor_owner") }),
    [sellerLabel, t]
  );

  const toggleTag = (key: string, list: string[], setList: (next: string[]) => void) => {
    setList(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const base = `/api/trade/product-chat/${encodeURIComponent(productChatId.trim())}/submit-review`;
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revieweeId: sellerId,
          roleType: "buyer_to_seller",
          publicReviewType: publicType,
          positiveTagKeys: showPositive ? positiveKeys : [],
          negativeTagKeys: showNegative ? negativeKeys : [],
          comment: sanitizeReviewComment(comment),
          isAnonymousNegative: publicType === "bad" || anonymousNegative,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? t("trade_review_form_submit_failed"));
        return;
      }
      onSubmitted();
      onClose();
    } catch {
      setError(t("trade_review_form_network_error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <DibayBottomSheet open onClose={onClose} title={heading} anchor="above-bottom-nav">
      <form onSubmit={(e) => void handleSubmit(e)} className={`space-y-4 ${OverlayUi.body}`}>
        <p className={OverlayUi.bodySecondary}>{t("mypage_comp_purchase_review_sheet_subtitle")}</p>

        <div>
          <p className={`mb-2 font-medium ${OverlayUi.caption}`}>{t("ui_review_evaluation")}</p>
          <div className="flex flex-wrap gap-2">
            {PUBLIC_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setPublicType(type)}
                className={`rounded-ui-rect border px-3 py-2 sam-text-body-secondary ${
                  publicType === type
                    ? "border-signature bg-signature/10 font-semibold text-sam-fg"
                    : "border-sam-border bg-sam-surface text-sam-muted"
                }`}
              >
                {publicTypeLabel(t, type)}
              </button>
            ))}
          </div>
        </div>

        {showPositive ? (
          <div>
            <p className={`mb-2 font-medium ${OverlayUi.caption}`}>{t("mypage_comp_review_positive")}</p>
            <div className="flex flex-wrap gap-1.5">
              {BUYER_TO_SELLER_POSITIVE.map(({ key }) => {
                const active = positiveKeys.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleTag(key, positiveKeys, setPositiveKeys)}
                    className={`rounded-full px-2.5 py-1 sam-text-xxs ${
                      active
                        ? "bg-signature/15 font-semibold text-sam-fg"
                        : "bg-sam-surface-muted text-sam-muted"
                    }`}
                  >
                    {tradeReviewTagLabel(t, "buyer_to_seller", key)}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {showNegative ? (
          <div>
            <p className={`mb-2 font-medium ${OverlayUi.caption}`}>{t("mypage_comp_review_negative")}</p>
            <div className="flex flex-wrap gap-1.5">
              {BUYER_TO_SELLER_NEGATIVE.map(({ key }) => {
                const active = negativeKeys.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleTag(key, negativeKeys, setNegativeKeys)}
                    className={`rounded-full px-2.5 py-1 sam-text-xxs ${
                      active
                        ? "bg-amber-100 font-semibold text-amber-950"
                        : "bg-sam-surface-muted text-sam-muted"
                    }`}
                  >
                    {tradeReviewTagLabel(t, "buyer_to_seller", key)}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div>
          <label className={`mb-1 block font-medium ${OverlayUi.caption}`} htmlFor="trade-review-comment">
            {t("trade_review_comment_label")}
          </label>
          <textarea
            id="trade-review-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            maxLength={200}
            className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary text-sam-fg"
            placeholder={t("trade_review_comment_placeholder")}
          />
        </div>

        {(publicType === "bad" || publicType === "normal") && (
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={anonymousNegative}
              onChange={(e) => setAnonymousNegative(e.target.checked)}
              className="mt-0.5 rounded border-sam-border"
            />
            <span className={`${OverlayUi.bodySecondary}`}>{t("ui_review_anonymous_negative")}</span>
          </label>
        )}

        {error ? <p className="sam-text-body-secondary text-[color:var(--overlay-danger)]">{error}</p> : null}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-ui-rect border border-sam-border py-2.5 sam-text-body text-sam-fg"
          >
            {t("common_cancel")}
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded-ui-rect bg-signature py-2.5 sam-text-body font-medium text-white disabled:opacity-50"
          >
            {loading ? t("trade_review_form_submitting") : t("trade_review_form_submit")}
          </button>
        </div>
      </form>
    </DibayBottomSheet>
  );
}
