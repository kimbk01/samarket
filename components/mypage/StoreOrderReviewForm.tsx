"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DetailHeader } from "@/components/layout/sector-header";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { dispatchWrittenReviewUpdated } from "@/lib/mypage/written-review-events";
import { fetchMeStoreOrderDetailDeduped } from "@/lib/stores/store-delivery-api-client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { StoreCommerceBottomActionShell } from "@/components/stores/commerce/StoreCommerceBottomActionShell";
import {
  storeCommerceActionContentPadClass,
  STORE_COMMERCE_ACTION_SUBMIT_FULL_CLASS,
} from "@/lib/stores/store-commerce-bottom-action-bar";

type ItemRow = { id: string; product_id: string; product_title_snapshot: string; qty?: number };

function CameraIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-sam-muted" aria-hidden>
      <path
        d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2v11z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function StoreOrderReviewForm({
  ordersHub = false,
  layout = "fullscreen",
}: {
  ordersHub?: boolean;
  /** fullscreen: 상단 X + 매장명 / inline: 폼만 */
  layout?: "fullscreen" | "inline";
}) {
  const { t } = useI18n();
  const params = useParams();
  const router = useRouter();
  const orderId = typeof params?.orderId === "string" ? params.orderId : "";
  const detailHref = orderId
    ? ordersHub
      ? `/orders/store/${encodeURIComponent(orderId)}`
      : `/mypage/store-orders/${encodeURIComponent(orderId)}`
    : ordersHub
      ? "/orders?tab=store"
      : "/mypage/store-orders";
  const listHref = ordersHub ? "/orders?tab=store" : "/mypage/store-orders";

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [storeName, setStoreName] = useState("");
  const [items, setItems] = useState<ItemRow[]>([]);
  const [canSubmit, setCanSubmit] = useState(false);
  const [hasReview, setHasReview] = useState(false);

  const [rating, setRating] = useState(5);
  const [content, setContent] = useState("");
  const [ownerOnly, setOwnerOnly] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [itemVote, setItemVote] = useState<Record<string, "up" | "down">>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setErr(null);
    try {
      const { json } = await fetchMeStoreOrderDetailDeduped(orderId);
      const j = json as {
        ok?: boolean;
        error?: string;
        order?: { store_name?: string };
        items?: unknown;
        review?: { id?: string };
        can_submit_review?: boolean;
      };
      if (!j?.ok) {
        setErr(typeof j?.error === "string" ? j.error : "load_failed");
        return;
      }
      setStoreName(String(j.order?.store_name ?? ""));
      const raw = (j.items ?? []) as Record<string, unknown>[];
      setItems(
        raw.map((r) => ({
          id: String(r.id ?? ""),
          product_id: String(r.product_id ?? ""),
          product_title_snapshot: String(r.product_title_snapshot ?? ""),
          qty: typeof r.qty === "number" ? r.qty : Number(r.qty) || 1,
        }))
      );
      setHasReview(!!j.review?.id);
      setCanSubmit(!!j.can_submit_review);
    } catch {
      setErr("network_error");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length || !orderId) return;
    const remain = 3 - imageUrls.length;
    if (remain <= 0) return;
    setUploadBusy(true);
    setErr(null);
    try {
      const toUpload = Array.from(files).slice(0, remain);
      const next: string[] = [...imageUrls];
      for (const file of toUpload) {
        const fd = new FormData();
        fd.append("order_id", orderId);
        fd.append("file", file);
        const res = await fetch("/api/me/store-reviews/upload-image", {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j?.ok || !j.url) {
          setErr(typeof j?.error === "string" ? j.error : t("mypage_comp_store_review_upload_failed"));
          break;
        }
        next.push(String(j.url));
      }
      setImageUrls(next);
    } catch {
      setErr(t("mypage_comp_store_review_upload_error"));
    } finally {
      setUploadBusy(false);
      e.target.value = "";
    }
  }

  function removeImage(i: number) {
    setImageUrls((prev) => prev.filter((_, idx) => idx !== i));
  }

  function setVote(lineId: string, v: "up" | "down") {
    setItemVote((prev) => {
      const cur = prev[lineId];
      const next = { ...prev };
      if (cur === v) delete next[lineId];
      else next[lineId] = v;
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!orderId || !canSubmit) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/me/store-reviews", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: orderId,
          rating,
          content: content.trim(),
          owner_only: ownerOnly,
          image_urls: imageUrls,
          item_feedback: itemVote,
        }),
      });
      const json = await res.json();
      if (!json?.ok) {
        const code = typeof json?.error === "string" ? json.error : "failed";
        setErr(
          code === "order_not_completed"
            ? t("mypage_comp_store_review_err_not_completed")
            : code === "review_already_exists"
              ? t("mypage_comp_store_review_err_exists")
              : t("mypage_comp_store_review_save_failed", { code })
        );
        return;
      }
      dispatchWrittenReviewUpdated();
      router.replace(detailHref);
      router.refresh();
    } catch {
      setErr("network_error");
    } finally {
      setBusy(false);
    }
  }

  const headerTitle = storeName.trim() || t("mypage_comp_store_review_title_default");

  const shell = (body: React.ReactNode) => {
    if (layout === "inline") {
      return <div className="sam-text-body text-sam-fg">{body}</div>;
    }
    return (
      <div className="min-h-screen bg-sam-surface">
        <DetailHeader
          title={loading ? "…" : headerTitle}
          backHref={detailHref}
          preferHistoryBack={false}
          backVariant="close"
          backAriaLabel={t("mypage_comp_close")}
        />
        <div className="mx-auto max-w-lg px-4 pt-4">{body}</div>
      </div>
    );
  };

  if (loading) {
    return shell(<p className="text-center text-sm text-sam-muted">{t("mypage_comp_loading_short")}</p>);
  }
  if (hasReview) {
    return shell(
      <div className="space-y-4 text-center text-sm text-sam-muted">
        <p>{t("mypage_comp_store_review_already")}</p>
        <Link href={detailHref} className="inline-block font-semibold text-signature underline">
          {t("mypage_comp_store_review_to_detail")}
        </Link>
      </div>
    );
  }
  if (!canSubmit) {
    return shell(
      <div className="space-y-4 text-center text-sm text-sam-muted">
        <p>{t("mypage_comp_store_review_after_complete")}</p>
        <Link href={detailHref} className="inline-block font-semibold text-signature underline">
          {t("mypage_comp_store_review_to_detail")}
        </Link>
        <div>
          <Link href={listHref} className="sam-text-body-secondary text-sam-muted underline">
            {t("mypage_comp_store_review_to_list")}
          </Link>
        </div>
      </div>
    );
  }

  return shell(
    <form onSubmit={(e) => void submit(e)} className="space-y-6">
      <div className="flex justify-center gap-2 py-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            className="p-1 transition-transform active:scale-95"
            aria-label={t("mypage_comp_store_review_rating_aria", { n })}
          >
            <span className={`sam-text-hero leading-none ${n <= rating ? "text-amber-400" : "text-sam-meta"}`}>
              ★
            </span>
          </button>
        ))}
      </div>

      <div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          maxLength={2000}
          placeholder={t("mypage_comp_store_review_placeholder")}
          className="w-full resize-none rounded-ui-rect border border-sam-border bg-sam-app/80 px-4 py-3 sam-text-body leading-relaxed text-sam-fg placeholder:text-sam-meta"
        />
      </div>

      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          multiple
          onChange={(e) => void onPickFile(e)}
        />
        <div className="flex flex-wrap gap-2">
          {imageUrls.map((url, i) => (
            <div key={url} className="relative h-20 w-20 overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface-muted">
              <SamarketThumbnail
                src={url}
                fill
                roundedClassName="rounded-ui-rect"
                className="bg-sam-surface-muted"
              />
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white"
                aria-label={t("mypage_comp_store_review_photo_delete_aria")}
              >
                ×
              </button>
            </div>
          ))}
          {imageUrls.length < 3 ? (
            <button
              type="button"
              disabled={uploadBusy}
              onClick={() => fileInputRef.current?.click()}
              className="flex h-20 w-20 flex-col items-center justify-center rounded-ui-rect border-2 border-dashed border-sam-border bg-sam-app text-sam-muted disabled:opacity-50"
            >
              <CameraIcon />
              <span className="mt-1 sam-text-xxs font-medium">{t("mypage_comp_store_review_photo")}</span>
            </button>
          ) : null}
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-ui-rect border border-sam-border-soft bg-sam-app/60 px-3 py-3">
        <input
          type="checkbox"
          checked={ownerOnly}
          onChange={(e) => setOwnerOnly(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-sam-border"
        />
        <span className="sam-text-body leading-snug text-sam-fg">{t("mypage_comp_store_review_owner_only")}</span>
      </label>
      <p className="-mt-4 sam-text-xxs leading-snug text-sam-muted">
        {t("mypage_comp_store_review_owner_only_hint")}
      </p>

      {items.length > 0 ? (
        <div className="space-y-3">
          <p className="sam-text-body font-semibold text-sam-fg">{t("mypage_comp_store_review_menu_heading")}</p>
          <ul className="space-y-3">
            {items.map((it) => {
              const v = itemVote[it.id];
              return (
                <li
                  key={it.id}
                  className="flex items-center justify-between gap-3 rounded-ui-rect border border-sam-border-soft bg-sam-surface px-3 py-3 shadow-sm"
                >
                  <span className="min-w-0 flex-1 sam-text-body font-medium text-sam-fg">
                    {it.product_title_snapshot}
                    {it.qty && it.qty > 1 ? (
                      <span className="ml-1 sam-text-helper font-normal text-sam-muted">×{it.qty}</span>
                    ) : null}
                  </span>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => setVote(it.id, "up")}
                      className={`rounded-ui-rect px-3 py-2 text-lg ${
                        v === "up" ? "bg-emerald-100 text-emerald-800" : "bg-sam-surface-muted text-sam-meta"
                      }`}
                      aria-label={t("mypage_comp_store_review_thumb_up_aria")}
                    >
                      👍
                    </button>
                    <button
                      type="button"
                      onClick={() => setVote(it.id, "down")}
                      className={`rounded-ui-rect px-3 py-2 text-lg ${
                        v === "down" ? "bg-rose-100 text-rose-800" : "bg-sam-surface-muted text-sam-meta"
                      }`}
                      aria-label={t("mypage_comp_store_review_thumb_down_aria")}
                    >
                      👎
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="rounded-ui-rect bg-sam-surface-muted px-3 py-3 sam-text-xxs leading-relaxed text-sam-muted">
        {t("mypage_comp_store_review_policy_hint")}
      </div>

      {err ? <p className="text-center text-sm text-red-600">{err}</p> : null}

      <div aria-hidden className={storeCommerceActionContentPadClass("review-submit")} />
      <StoreCommerceBottomActionShell
        variant="review-submit"
        portal={false}
        dataAttribute="data-store-review-submit"
      >
        <div className="px-4 py-2">
          <button
            type="submit"
            disabled={busy || content.trim().length < 5}
            className={STORE_COMMERCE_ACTION_SUBMIT_FULL_CLASS}
          >
            {busy ? t("mypage_comp_store_review_submitting") : t("mypage_comp_store_review_submit")}
          </button>
        </div>
      </StoreCommerceBottomActionShell>
    </form>
  );
}
