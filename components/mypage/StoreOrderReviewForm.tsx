"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { dispatchWrittenReviewUpdated } from "@/lib/mypage/written-review-events";

type ItemRow = { id: string; product_id: string; product_title_snapshot: string; qty?: number };

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M18 6L6 18M6 6l12 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-gray-600" aria-hidden>
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
      const res = await fetch(`/api/me/store-orders/${encodeURIComponent(orderId)}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!json?.ok) {
        setErr(typeof json?.error === "string" ? json.error : "load_failed");
        return;
      }
      setStoreName(String(json.order?.store_name ?? ""));
      const raw = (json.items ?? []) as Record<string, unknown>[];
      setItems(
        raw.map((r) => ({
          id: String(r.id ?? ""),
          product_id: String(r.product_id ?? ""),
          product_title_snapshot: String(r.product_title_snapshot ?? ""),
          qty: typeof r.qty === "number" ? r.qty : Number(r.qty) || 1,
        }))
      );
      setHasReview(!!json.review?.id);
      setCanSubmit(!!json.can_submit_review);
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
          setErr(typeof j?.error === "string" ? j.error : "이미지 업로드에 실패했습니다.");
          break;
        }
        next.push(String(j.url));
      }
      setImageUrls(next);
    } catch {
      setErr("이미지 업로드 중 오류가 발생했습니다.");
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
            ? "거래 완료된 주문만 리뷰를 남길 수 있습니다."
            : code === "review_already_exists"
              ? "이미 리뷰를 작성했습니다."
              : `저장에 실패했습니다. (${code})`
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

  const headerTitle = storeName.trim() || "리뷰 작성";

  const shell = (body: React.ReactNode) => {
    if (layout === "inline") {
      return <div className="text-[15px] text-gray-900">{body}</div>;
    }
    return (
      <div className="min-h-screen bg-white">
        <header className="sticky top-0 z-10 flex h-12 items-center border-b border-gray-100 bg-white px-2">
          <Link
            href={detailHref}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-800 hover:bg-gray-100"
            aria-label="닫기"
          >
            <CloseIcon />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-center text-[16px] font-semibold text-gray-900">
            {loading ? "…" : headerTitle}
          </h1>
          <span className="w-11 shrink-0" />
        </header>
        <div className="mx-auto max-w-lg px-4 pb-28 pt-4">{body}</div>
      </div>
    );
  };

  if (loading) {
    return shell(<p className="text-center text-sm text-gray-500">불러오는 중…</p>);
  }
  if (hasReview) {
    return shell(
      <div className="space-y-4 text-center text-sm text-gray-600">
        <p>이 주문에는 이미 리뷰가 있습니다.</p>
        <Link href={detailHref} className="inline-block font-semibold text-signature underline">
          주문 상세로
        </Link>
      </div>
    );
  }
  if (!canSubmit) {
    return shell(
      <div className="space-y-4 text-center text-sm text-gray-600">
        <p>주문이 완료된 뒤에 리뷰를 작성할 수 있습니다.</p>
        <Link href={detailHref} className="inline-block font-semibold text-signature underline">
          주문 상세로
        </Link>
        <div>
          <Link href={listHref} className="text-[13px] text-gray-500 underline">
            주문 목록
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
            aria-label={`별점 ${n}점`}
          >
            <span className={`text-[36px] leading-none ${n <= rating ? "text-amber-400" : "text-gray-200"}`}>
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
          placeholder="리뷰는 솔직하게 작성해주세요"
          className="w-full resize-none rounded-ui-rect border border-gray-200 bg-gray-50/80 px-4 py-3 text-[15px] leading-relaxed text-gray-900 placeholder:text-gray-400"
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
            <div key={url} className="relative h-20 w-20 overflow-hidden rounded-ui-rect border border-gray-200 bg-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white"
                aria-label="사진 삭제"
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
              className="flex h-20 w-20 flex-col items-center justify-center rounded-ui-rect border-2 border-dashed border-gray-200 bg-gray-50 text-gray-500 disabled:opacity-50"
            >
              <CameraIcon />
              <span className="mt-1 text-[10px] font-medium">사진</span>
            </button>
          ) : null}
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-ui-rect border border-gray-100 bg-gray-50/60 px-3 py-3">
        <input
          type="checkbox"
          checked={ownerOnly}
          onChange={(e) => setOwnerOnly(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300"
        />
        <span className="text-[14px] leading-snug text-gray-800">사장님에게만 보이게</span>
      </label>
      <p className="-mt-4 text-[11px] leading-snug text-gray-500">
        체크 시 다른 고객이 보는 매장 리뷰 목록에는 표시되지 않을 수 있어요. 매장·운영 검수 목적에 활용됩니다.
      </p>

      {items.length > 0 ? (
        <div className="space-y-3">
          <p className="text-[15px] font-semibold text-gray-900">메뉴는 괜찮았나요?</p>
          <ul className="space-y-3">
            {items.map((it) => {
              const v = itemVote[it.id];
              return (
                <li
                  key={it.id}
                  className="flex items-center justify-between gap-3 rounded-ui-rect border border-gray-100 bg-white px-3 py-3 shadow-sm"
                >
                  <span className="min-w-0 flex-1 text-[14px] font-medium text-gray-900">
                    {it.product_title_snapshot}
                    {it.qty && it.qty > 1 ? (
                      <span className="ml-1 text-[12px] font-normal text-gray-500">×{it.qty}</span>
                    ) : null}
                  </span>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => setVote(it.id, "up")}
                      className={`rounded-ui-rect px-3 py-2 text-lg ${
                        v === "up" ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-400"
                      }`}
                      aria-label="좋아요"
                    >
                      👍
                    </button>
                    <button
                      type="button"
                      onClick={() => setVote(it.id, "down")}
                      className={`rounded-ui-rect px-3 py-2 text-lg ${
                        v === "down" ? "bg-rose-100 text-rose-800" : "bg-gray-100 text-gray-400"
                      }`}
                      aria-label="아쉬워요"
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

      <div className="rounded-ui-rect bg-gray-100 px-3 py-3 text-[11px] leading-relaxed text-gray-600">
        솔직한 리뷰는 다른 이용자에게 큰 도움이 됩니다. 허위·비방·불법적인 내용은 제재 대상이 될 수 있어요.
      </div>

      {err ? <p className="text-center text-sm text-red-600">{err}</p> : null}

      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-gray-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-lg">
          <button
            type="submit"
            disabled={busy || content.trim().length < 5}
            className="w-full rounded-ui-rect bg-gray-900 py-3.5 text-[16px] font-semibold text-white disabled:opacity-40"
          >
            {busy ? "등록 중…" : "리뷰 작성 완료"}
          </button>
        </div>
      </div>
    </form>
  );
}
