"use client";

/**
 * 메신저 거래방 「거래 평가」 줄 + 시트 — CREW REP S5 (설계 §7.3·§7.5).
 * 자격은 서버만 판정한다(GET /api/trade/product-chat/:id/rating). 할 일이 없으면 아무것도 그리지 않는다.
 * - 자격 있음·미평가 → 「거래 평가 남기기」
 * - 내 평가 공개 대기 → 안내 한 줄
 * - 상대 평가 공개됨 → 결과 한 줄, 받은 아쉬워요는 14일 안 1회 이의제기
 */
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { allowedTagKeys, type TradeRatingRole, type TradeRatingType } from "@/lib/trade/trade-rating-client";
import { tradeReviewTagLabel } from "@/lib/trade/trade-review-tags";
import { Sam } from "@/lib/ui/sam-component-classes";

type PublicRating = {
  id: string;
  ratingType: TradeRatingType;
  tags: string[];
  status: string;
  revealedAt: string | null;
  disputeDecision: string | null;
  canDispute?: boolean;
};
type RatingState = {
  eligibility: { eligible: boolean; reasons: string[]; role: TradeRatingRole | null; windowEndsAt: string | null };
  mine: PublicRating | null;
  theirs: PublicRating | null;
};

const TYPE_KEY = {
  good: "trade_rating_type_good",
  normal: "trade_rating_type_normal",
  bad: "trade_rating_type_bad",
} as const;

const ERROR_KEY: Record<string, "trade_rating_error_not_eligible" | "trade_rating_error_tag_required" | "trade_rating_error_generic"> = {
  bad_rating_tag_required: "trade_rating_error_tag_required",
  not_enough_messages: "trade_rating_error_not_eligible",
  conversation_too_short: "trade_rating_error_not_eligible",
  window_not_open: "trade_rating_error_not_eligible",
  window_closed: "trade_rating_error_not_eligible",
  already_rated: "trade_rating_error_not_eligible",
};

const chipBase = "inline-flex min-h-[36px] items-center rounded-full border px-3.5 sam-text-body-secondary font-semibold";

export function TradeRatingStrip({ productChatId, counterpartLabel }: { productChatId: string; counterpartLabel: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<RatingState | null>(null);
  const [sheet, setSheet] = useState<"rate" | "dispute" | null>(null);
  const [tradeHappened, setTradeHappened] = useState<"yes" | "chat_only" | null>(null);
  const [ratingType, setRatingType] = useState<TradeRatingType | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/trade/product-chat/${encodeURIComponent(productChatId)}/rating`, { credentials: "include" });
      const data = (await res.json()) as { ok?: boolean } & Partial<RatingState>;
      if (!res.ok || !data.ok || !data.eligibility) {
        setState(null);
        return;
      }
      setState({ eligibility: data.eligibility, mine: data.mine ?? null, theirs: data.theirs ?? null });
    } catch {
      setState(null);
    }
  }, [productChatId]);

  useEffect(() => {
    void load();
  }, [load]);

  const role = state?.eligibility.role ?? null;
  const tagOptions = role && ratingType ? allowedTagKeys(role, ratingType) : [];
  const canSubmit = Boolean(tradeHappened && ratingType && (ratingType !== "bad" || tags.length > 0)) && !busy;

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/trade/product-chat/${encodeURIComponent(productChatId)}/rating`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeHappened, ratingType, tags, comment }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(t(ERROR_KEY[data.error ?? ""] ?? "trade_rating_error_generic"));
        return;
      }
      setSheet(null);
      await load();
    } catch {
      setError(t("trade_rating_error_generic"));
    } finally {
      setBusy(false);
    }
  }, [canSubmit, comment, load, productChatId, ratingType, t, tags, tradeHappened]);

  const submitDispute = useCallback(async () => {
    const id = state?.theirs?.id;
    if (!id || disputeReason.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/trade/ratings/${encodeURIComponent(id)}/dispute`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: disputeReason.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!res.ok || !data.ok) {
        setError(t("trade_rating_error_generic"));
        return;
      }
      setSheet(null);
      await load();
    } catch {
      setError(t("trade_rating_error_generic"));
    } finally {
      setBusy(false);
    }
  }, [disputeReason, load, state?.theirs?.id, t]);

  if (!state) return null;
  const { eligibility, mine, theirs } = state;
  const showRate = eligibility.eligible && !mine;
  const showPending = mine?.status === "pending_reveal";
  if (!showRate && !showPending && !theirs) return null;

  const tagLabel = (k: string) => (role ? tradeReviewTagLabel(t, role === "buyer_to_seller" ? "seller_to_buyer" : "buyer_to_seller", k) : k);
  const myTagLabel = (k: string) => (role ? tradeReviewTagLabel(t, role, k) : k);

  return (
    <>
      <div
        data-testid="trade-rating-strip"
        className="flex shrink-0 items-center gap-2 border-b border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] px-3 py-2"
      >
        <p className="min-w-0 flex-1 truncate sam-text-helper text-[color:var(--cm-room-text)]">
          {showRate
            ? t("trade_rating_strip_prompt")
            : theirs
              ? `${t("trade_rating_strip_received")} ${t(TYPE_KEY[theirs.ratingType])}${
                  theirs.tags.length ? ` · ${theirs.tags.map(tagLabel).join(", ")}` : ""
                }${theirs.status === "disputed" ? ` · ${t("trade_rating_dispute_reviewing")}` : ""}`
              : t("trade_rating_strip_pending")}
        </p>
        {showRate ? (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setSheet("rate");
            }}
            className="shrink-0 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-helper font-semibold text-sam-fg active:opacity-90"
          >
            {t("trade_rating_strip_button")}
          </button>
        ) : theirs?.canDispute ? (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setSheet("dispute");
            }}
            className="shrink-0 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-helper font-semibold text-sam-fg active:opacity-90"
          >
            {t("trade_rating_dispute_button")}
          </button>
        ) : null}
      </div>

      <DibayBottomSheet
        open={sheet === "rate"}
        onClose={() => setSheet(null)}
        title={t("trade_rating_sheet_title", { name: counterpartLabel })}
        footer={
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void submit()}
            className={`${Sam.btn.primaryCombo} w-full disabled:opacity-50`}
            data-testid="trade-rating-submit"
          >
            {t("trade_rating_submit")}
          </button>
        }
      >
        <p className="sam-text-helper text-sam-muted">{t("trade_rating_sheet_hint")}</p>
        <p className="mt-4 sam-text-body font-semibold text-sam-fg">{t("trade_rating_q_happened")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["yes", "chat_only"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setTradeHappened(v)}
              className={`${chipBase} ${tradeHappened === v ? "border-sam-primary bg-sam-primary text-white" : "border-sam-border bg-sam-surface text-sam-fg"}`}
            >
              {t(v === "yes" ? "trade_rating_happened_yes" : "trade_rating_happened_chat_only")}
            </button>
          ))}
        </div>
        <p className="mt-4 sam-text-body font-semibold text-sam-fg">{t("trade_rating_q_type")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["good", "normal", "bad"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                setRatingType(v);
                setTags([]);
              }}
              className={`${chipBase} ${
                ratingType === v
                  ? v === "bad"
                    ? "border-sam-danger bg-sam-danger text-white"
                    : "border-sam-primary bg-sam-primary text-white"
                  : "border-sam-border bg-sam-surface text-sam-fg"
              }`}
            >
              {t(TYPE_KEY[v])}
            </button>
          ))}
        </div>
        {ratingType ? (
          <>
            <p className="mt-4 sam-text-body font-semibold text-sam-fg">
              {t(ratingType === "bad" ? "trade_rating_q_tags_bad" : "trade_rating_q_tags_good")}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {tagOptions.map((k) => {
                const on = tags.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTags((prev) => (on ? prev.filter((x) => x !== k) : [...prev, k]))}
                    className={`${chipBase} ${on ? "border-sam-fg bg-sam-fg text-white" : "border-sam-border bg-sam-surface text-sam-fg"}`}
                  >
                    {myTagLabel(k)}
                  </button>
                );
              })}
            </div>
          </>
        ) : null}
        <p className="mt-4 sam-text-body font-semibold text-sam-fg">{t("trade_rating_q_comment")}</p>
        <textarea
          value={comment}
          maxLength={200}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t("trade_rating_comment_placeholder")}
          className="mt-2 h-20 w-full rounded-ui-rect border border-sam-border bg-sam-surface p-2.5 sam-text-body text-sam-fg"
        />
        {error ? <p className="mt-2 sam-text-helper text-sam-danger">{error}</p> : null}
      </DibayBottomSheet>

      <DibayBottomSheet
        open={sheet === "dispute"}
        onClose={() => setSheet(null)}
        title={t("trade_rating_dispute_title")}
        footer={
          <button
            type="button"
            disabled={busy || disputeReason.trim().length < 2}
            onClick={() => void submitDispute()}
            className={`${Sam.btn.primaryCombo} w-full disabled:opacity-50`}
          >
            {t("trade_rating_dispute_submit")}
          </button>
        }
      >
        <p className="sam-text-helper text-sam-muted">{t("trade_rating_dispute_hint")}</p>
        <textarea
          value={disputeReason}
          maxLength={200}
          onChange={(e) => setDisputeReason(e.target.value)}
          placeholder={t("trade_rating_dispute_placeholder")}
          className="mt-3 h-24 w-full rounded-ui-rect border border-sam-border bg-sam-surface p-2.5 sam-text-body text-sam-fg"
        />
        {error ? <p className="mt-2 sam-text-helper text-sam-danger">{error}</p> : null}
      </DibayBottomSheet>
    </>
  );
}
