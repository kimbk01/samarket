"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import type { OwnerStoreOrderReviewDetail } from "@/lib/stores/owner-store-order-review-meta";
import { runSingleFlight } from "@/lib/http/run-single-flight";

function StarRatingRow({
  rating,
  ratingAria,
}: {
  rating: number;
  ratingAria: string;
}) {
  const r = Math.min(5, Math.max(0, Math.floor(Number(rating) || 0)));
  return (
    <span className="inline-flex text-base leading-none text-amber-500" aria-label={ratingAria}>
      {"★".repeat(r)}
      <span className="text-[#D1D5DB]">{"☆".repeat(5 - r)}</span>
    </span>
  );
}

type Props = {
  storeId: string;
  orderId: string;
  reviewStatus: string | null | undefined;
  enabled: boolean;
  onReviewLoaded?: (review: OwnerStoreOrderReviewDetail | null) => void;
};

export function OwnerStoreOrderReviewBlock({
  storeId,
  orderId,
  reviewStatus,
  enabled,
  onReviewLoaded,
}: Props) {
  const { t, language } = useI18n();
  const [review, setReview] = useState<OwnerStoreOrderReviewDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const sid = storeId.trim();
    const oid = orderId.trim();
    if (!sid || !oid) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await runSingleFlight(`owner:order-review:${sid}:${oid}`, () =>
        fetch(`/api/me/stores/${encodeURIComponent(sid)}/orders/${encodeURIComponent(oid)}/review`, {
          credentials: "include",
          cache: "no-store",
        })
      );
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        review?: OwnerStoreOrderReviewDetail | null;
      };
      if (!res.ok || !j?.ok) {
        setErr(typeof j?.error === "string" ? j.error : "load_failed");
        setReview(null);
        onReviewLoaded?.(null);
        return;
      }
      const next = j.review ?? null;
      setReview(next);
      setDraft(next?.owner_reply_content ?? "");
      onReviewLoaded?.(next);
    } catch {
      setErr("network_error");
      setReview(null);
      onReviewLoaded?.(null);
    } finally {
      setLoading(false);
    }
  }, [onReviewLoaded, orderId, storeId]);

  useEffect(() => {
    if (!enabled) {
      setReview(null);
      setDraft("");
      setErr(null);
      onReviewLoaded?.(null);
      return;
    }
    if (reviewStatus === "not_applicable" || reviewStatus === "unavailable") {
      setReview(null);
      onReviewLoaded?.(null);
      return;
    }
    void load();
  }, [enabled, load, onReviewLoaded, reviewStatus]);

  const saveReply = useCallback(async () => {
    const sid = storeId.trim();
    const rid = review?.id?.trim();
    const reply = draft.trim();
    if (!sid || !rid || !reply) return;
    setBusy(true);
    setErr(null);
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
        setErr(typeof j?.error === "string" ? j.error : "reply_failed");
        return;
      }
      await load();
    } catch {
      setErr("network_error");
    } finally {
      setBusy(false);
    }
  }, [draft, load, review?.id, storeId]);

  const deleteReply = useCallback(async () => {
    const sid = storeId.trim();
    const rid = review?.id?.trim();
    if (!sid || !rid) return;
    setBusy(true);
    setErr(null);
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
        setErr(typeof j?.error === "string" ? j.error : "delete_reply_failed");
        return;
      }
      setDraft("");
      await load();
    } catch {
      setErr("network_error");
    } finally {
      setBusy(false);
    }
  }, [load, review?.id, storeId]);

  if (!enabled || reviewStatus === "not_applicable") return null;

  const dateLocale = language === "en" ? "en-US" : "ko-KR";

  if (reviewStatus === "unavailable") {
    return (
      <OwnerReviewShell>
        <p className="text-[13px] leading-[1.45] text-[#6B7280]">{t("store_owner_order_review_unavailable")}</p>
      </OwnerReviewShell>
    );
  }

  if (loading && !review) {
    return (
      <OwnerReviewShell>
        <p className="text-[13px] text-[#6B7280]">{t("common_loading")}</p>
      </OwnerReviewShell>
    );
  }

  if (err && !review) {
    return (
      <OwnerReviewShell>
        <p className="text-[12px] text-red-700">{resolveOwnerApiErrorMessage(err, t)}</p>
      </OwnerReviewShell>
    );
  }

  if (reviewStatus === "pending" && !review) {
    return (
      <OwnerReviewShell>
        <p className="text-[13px] leading-[1.45] text-[#6B7280]">{t("store_owner_order_review_pending")}</p>
      </OwnerReviewShell>
    );
  }

  if (!review) return null;

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
            <span className="text-[11px] text-[#6B7280]">
              {new Date(review.created_at).toLocaleDateString(dateLocale)}
            </span>
          ) : null}
          {!review.visible_to_public ? (
            <span className="rounded-[4px] bg-[#F3F4F6] px-1.5 py-0.5 text-[10px] font-semibold text-[#6B7280]">
              {t("store_owner_order_review_private_badge")}
            </span>
          ) : null}
        </div>

        {review.content ? (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--biz-text)]">{review.content}</p>
        ) : null}

        {review.image_urls.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {review.image_urls.map((src) => (
              <SamarketThumbnail
                key={src}
                src={src}
                alt=""
                size={64}
                className="h-16 w-16 shrink-0"
                roundedClassName="rounded-[4px]"
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-3 rounded-[4px] border border-[var(--biz-card-border)] bg-[#f6f6f6] p-2.5">
        <p className="text-[12px] font-bold text-[var(--biz-text)]">{t("business_phase7_138")}</p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("business_phase7_017")}
          rows={3}
          className="mt-2 w-full rounded-[4px] border border-[var(--biz-card-border)] bg-white px-2 py-1.5 text-[13px] outline-none focus:ring-2 focus:ring-[var(--biz-primary)]/20"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          {review.owner_reply_content ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void deleteReply()}
              className="rounded-[4px] border border-red-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-red-600 disabled:opacity-40"
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
            className="rounded-[4px] bg-[var(--biz-primary)] px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40"
          >
            {busy ? t("business_phase7_384") : t("business_phase7_471")}
          </button>
        </div>
        {review.owner_reply_created_at ? (
          <p className="mt-1 text-right text-[11px] tabular-nums text-[#6B7280]">
            {new Date(review.owner_reply_created_at).toLocaleString(dateLocale)}
          </p>
        ) : null}
      </div>

      {err ? (
        <p className="mt-2 text-[12px] text-red-700">{resolveOwnerApiErrorMessage(err, t)}</p>
      ) : null}
    </OwnerReviewShell>
  );
}

function OwnerReviewShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <section className="rounded-[4px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] p-3">
      <h3 className="mb-2 border-l-4 border-[var(--biz-primary)] pl-2 text-[12px] font-bold leading-[1.35] text-[var(--biz-primary)]">
        {t("store_owner_order_review_section")}
      </h3>
      {children}
    </section>
  );
}

/** 메뉴 라인 옆 👍/👎 배지 */
export function OwnerOrderItemFeedbackBadge({
  vote,
}: {
  vote: "up" | "down" | null | undefined;
}) {
  const { t } = useI18n();
  if (vote === "up") {
    return (
      <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
        👍 {t("store_review_menu_good")}
      </span>
    );
  }
  if (vote === "down") {
    return (
      <span className="shrink-0 rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
        👎 {t("store_review_menu_bad")}
      </span>
    );
  }
  return null;
}
