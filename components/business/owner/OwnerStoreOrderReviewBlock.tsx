"use client";

import { useCallback, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import type { OwnerStoreOrderReviewDetail } from "@/lib/stores/owner-store-order-review-meta";
import { StoreReviewThumbIcon } from "@/components/stores/review/StoreReviewThumbIcon";

function StarRatingRow({
  rating,
  ratingAria,
}: {
  rating: number;
  ratingAria: string;
}) {
  const r = Math.min(5, Math.max(0, Math.floor(Number(rating) || 0)));
  return (
    <span className="inline-flex text-base leading-none text-sam-warning" aria-label={ratingAria}>
      {"★".repeat(r)}
      <span className="text-sam-meta">{"☆".repeat(5 - r)}</span>
    </span>
  );
}

type Props = {
  storeId: string;
  reviewStatus: string | null | undefined;
  enabled: boolean;
  review: OwnerStoreOrderReviewDetail | null;
  loading: boolean;
  loadErr: string | null;
  onReviewChange?: Dispatch<SetStateAction<OwnerStoreOrderReviewDetail | null>>;
};

export function OwnerStoreOrderReviewBlock({
  storeId,
  reviewStatus,
  enabled,
  review,
  loading,
  loadErr,
  onReviewChange,
}: Props) {
  const { t, language } = useI18n();
  const [replyErr, setReplyErr] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(review?.owner_reply_content ?? "");
  }, [review?.id, review?.owner_reply_content]);

  const applyReplyLocally = useCallback(
    (reply: string | null) => {
      onReviewChange?.((prev) => {
        if (!prev) return prev;
        const trimmed = reply?.trim() ?? "";
        return {
          ...prev,
          owner_reply_content: trimmed || null,
          owner_reply_created_at: trimmed ? prev.owner_reply_created_at || new Date().toISOString() : null,
        };
      });
      setDraft(reply ?? "");
    },
    [onReviewChange]
  );

  const saveReply = useCallback(async () => {
    const sid = storeId.trim();
    const rid = review?.id?.trim();
    const reply = draft.trim();
    if (!sid || !rid || !reply) return;
    setBusy(true);
    setReplyErr(null);
    try {
      const res = await fetch(
        `/api/me/stores/${encodeURIComponent(sid)}/reviews/${encodeURIComponent(rid)}/reply`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reply }),
        }
      );
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j?.ok) {
        setReplyErr(typeof j?.error === "string" ? j.error : "reply_failed");
        return;
      }
      applyReplyLocally(reply);
    } catch {
      setReplyErr("network_error");
    } finally {
      setBusy(false);
    }
  }, [applyReplyLocally, draft, review?.id, storeId]);

  const deleteReply = useCallback(async () => {
    const sid = storeId.trim();
    const rid = review?.id?.trim();
    if (!sid || !rid) return;
    setBusy(true);
    setReplyErr(null);
    try {
      const res = await fetch(
        `/api/me/stores/${encodeURIComponent(sid)}/reviews/${encodeURIComponent(rid)}/reply`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reply: "" }),
        }
      );
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j?.ok) {
        setReplyErr(typeof j?.error === "string" ? j.error : "delete_reply_failed");
        return;
      }
      applyReplyLocally(null);
    } catch {
      setReplyErr("network_error");
    } finally {
      setBusy(false);
    }
  }, [applyReplyLocally, review?.id, storeId]);

  if (!enabled || reviewStatus === "not_applicable") return null;

  const dateLocale = language === "en" ? "en-US" : "ko-KR";

  if (reviewStatus === "unavailable") {
    return (
      <OwnerReviewShell>
        <p className="text-[13px] leading-[1.45] text-sam-muted">{t("store_owner_order_review_unavailable")}</p>
      </OwnerReviewShell>
    );
  }

  if (reviewStatus === "pending") {
    return (
      <OwnerReviewShell>
        <p className="text-[13px] leading-[1.45] text-sam-muted">{t("store_owner_order_review_pending")}</p>
      </OwnerReviewShell>
    );
  }

  if (loading && !review) {
    return (
      <OwnerReviewShell>
        <p className="text-[13px] text-sam-muted">{t("common_loading")}</p>
      </OwnerReviewShell>
    );
  }

  if (!review) {
    if (loadErr) {
      return (
        <OwnerReviewShell>
          <p className="text-[12px] text-sam-danger">{resolveOwnerApiErrorMessage(loadErr, t)}</p>
        </OwnerReviewShell>
      );
    }
    return (
      <OwnerReviewShell>
        <p className="text-[13px] leading-[1.45] text-sam-muted">{t("store_owner_order_review_empty")}</p>
      </OwnerReviewShell>
    );
  }

  return (
    <OwnerReviewShell>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {review.rating > 0 ? (
            <StarRatingRow
              rating={review.rating}
              ratingAria={t("store_owner_order_review_rating_aria", { n: String(review.rating) })}
            />
          ) : null}
          {review.created_at ? (
            <span className="text-[11px] text-sam-muted">
              {new Date(review.created_at).toLocaleDateString(dateLocale)}
            </span>
          ) : null}
          {!review.visible_to_public ? (
            <span className="rounded-ui-rect bg-sam-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-sam-muted">
              {t("store_owner_order_review_private_badge")}
            </span>
          ) : null}
        </div>

        {review.content ? (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--biz-text)]">{review.content}</p>
        ) : null}

        {review.image_urls?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {review.image_urls.map((src) => (
              <SamarketThumbnail
                key={src}
                src={src}
                alt={t("store_owner_order_review_photo_alt")}
                size={64}
                className="h-16 w-16 shrink-0"
                roundedClassName="rounded-ui-rect"
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-3 rounded-ui-rect border border-[var(--biz-card-border)] bg-sam-surface-muted p-2.5">
        <p className="text-[12px] font-bold text-[var(--biz-text)]">{t("business_phase7_138")}</p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("business_phase7_017")}
          rows={3}
          className="mt-2 w-full rounded-ui-rect border border-[var(--biz-card-border)] bg-sam-surface px-2 py-1.5 text-[13px] outline-none focus:ring-2 focus:ring-[var(--biz-primary)]/20"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          {review.owner_reply_content ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void deleteReply()}
              className="rounded-ui-rect border border-sam-danger/30 bg-sam-surface px-2.5 py-1.5 text-[12px] font-semibold text-sam-danger disabled:opacity-40"
            >
              {t("business_phase7_reply_delete")}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            disabled={busy || !draft.trim()}
            onClick={() => void saveReply()}
            className="rounded-ui-rect bg-[var(--biz-primary)] px-3 py-1.5 text-[12px] font-bold text-sam-on-primary disabled:opacity-40"
          >
            {busy ? t("business_phase7_384") : t("business_phase7_471")}
          </button>
        </div>
        {review.owner_reply_created_at ? (
          <p className="mt-1 text-right text-[11px] tabular-nums text-sam-muted">
            {new Date(review.owner_reply_created_at).toLocaleString(dateLocale)}
          </p>
        ) : null}
        {replyErr ? (
          <p className="mt-2 text-[12px] text-sam-danger">{resolveOwnerApiErrorMessage(replyErr, t)}</p>
        ) : null}
      </div>
    </OwnerReviewShell>
  );
}

function OwnerReviewShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <section className="rounded-ui-rect border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] p-3">
      <h3 className="mb-2 border-l-4 border-[var(--biz-primary)] pl-2 text-[12px] font-bold leading-[1.35] text-[var(--biz-primary)]">
        {t("store_owner_order_review_section")}
      </h3>
      {children}
    </section>
  );
}

/** 메뉴 라인 옆 좋아요/싫어요 배지 */
export function OwnerOrderItemFeedbackBadge({
  vote,
}: {
  vote: "up" | "down" | null | undefined;
}) {
  const { t } = useI18n();
  if (vote === "up") {
    return (
      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-sam-info-soft px-1.5 py-0.5 text-[10px] font-semibold text-sam-info">
        <StoreReviewThumbIcon variant="up" className="h-3 w-3" filled />
        {t("store_review_menu_good")}
      </span>
    );
  }
  if (vote === "down") {
    return (
      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-sam-danger-soft px-1.5 py-0.5 text-[10px] font-semibold text-sam-danger">
        <StoreReviewThumbIcon variant="down" className="h-3 w-3" filled />
        {t("store_review_menu_bad")}
      </span>
    );
  }
  return null;
}
