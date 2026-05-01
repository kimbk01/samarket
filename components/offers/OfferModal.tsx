"use client";

import { useEffect, useId, useState } from "react";
import { formatPrice, formatPriceInput } from "@/lib/utils/format";
import type { PriceOfferListItem } from "@/lib/offers/types";

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
  const titleId = useId();
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const minAllowed = Math.ceil(originalPrice * 0.5);
  const titleTrim = typeof productTitle === "string" ? productTitle.trim() : "";

  const submit = async () => {
    const digits = offeredPrice.replace(/\D/g, "");
    const nextPrice = digits ? Number(digits) : NaN;
    if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
      setError("제안 가격을 입력해 주세요.");
      return;
    }
    if (nextPrice < minAllowed) {
      setError(`최소 ${formatPrice(minAllowed, currency)} 이상만 제안할 수 있습니다.`);
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
        setError(typeof json?.error === "string" ? json.error : "가격 제안을 보내지 못했습니다.");
        return;
      }
      onSubmitted?.(json.offer);
      onClose();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[45] flex flex-col justify-end sm:items-center sm:justify-center sm:p-4">
      <button
        type="button"
        aria-label="닫기"
        disabled={busy}
        className="absolute inset-0 bg-black/50 backdrop-blur-[1px] transition-opacity sm:bg-black/40"
        onClick={() => {
          if (!busy) onClose();
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[1] flex max-h-[min(92vh,680px)] w-full flex-col overflow-hidden rounded-t-[20px] border border-sam-border border-b-0 bg-sam-surface shadow-[0_-8px_32px_rgba(0,0,0,0.12)] sm:max-w-[480px] sm:rounded-2xl sm:border-b sm:shadow-2xl"
      >
        {/* 모바일: 상단 핸들 (Marketplace 스타일) */}
        <div className="flex shrink-0 justify-center pt-2 sm:hidden" aria-hidden>
          <div className="h-1 w-10 rounded-full bg-sam-border" />
        </div>

        {/* 헤더 */}
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-sam-border px-4 pb-3 pt-1 sm:pt-3">
          <h2 id={titleId} className="min-w-0 flex-1 text-[17px] font-bold leading-snug text-sam-fg">
            가격 제안하기
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[22px] leading-none text-sam-muted transition-colors hover:bg-sam-surface-muted disabled:opacity-50"
            aria-label="닫기"
          >
            ×
          </button>
        </header>

        {/* 상품 맥락 (FB 마켓플레이스 상단 카드) */}
        {titleTrim.length > 0 ? (
          <div className="shrink-0 border-b border-sam-border bg-sam-surface-muted/80 px-4 py-3">
            <p className="truncate text-[15px] font-semibold text-sam-fg">{titleTrim}</p>
            <p className="mt-0.5 text-[13px] text-sam-muted">
              판매가 <span className="font-semibold text-sam-fg">{formatPrice(originalPrice, currency)}</span>
              {" · "}
              최소 제안 {formatPrice(minAllowed, currency)}
            </p>
          </div>
        ) : (
          <p className="shrink-0 border-b border-sam-border px-4 py-3 text-[13px] leading-relaxed text-sam-muted">
            판매가 {formatPrice(originalPrice, currency)} · 최소 제안가 {formatPrice(minAllowed, currency)} (판매가의 50%
            이상)
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <p className="mb-4 text-[12px] leading-relaxed text-sam-muted">
            같은 상품에는 대기 중인 제안 1건만 있을 수 있으며, 24시간 동안 최대 3회까지 보낼 수 있어요.
          </p>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-sam-fg">제안 가격</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={offeredPrice}
                onChange={(e) => setOfferedPrice(formatPriceInput(e.target.value))}
                placeholder={formatPriceInput(String(minAllowed))}
                className="w-full rounded-xl border border-sam-border bg-sam-app px-3.5 py-3 text-[15px] text-sam-fg outline-none ring-sam-primary/25 placeholder:text-sam-muted focus:border-sam-primary focus:ring-2"
                disabled={busy}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-sam-fg">메시지 (선택)</span>
              <textarea
                rows={4}
                maxLength={500}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="판매자에게 전달할 내용을 적어 주세요."
                className="w-full resize-none rounded-xl border border-sam-border bg-sam-app px-3.5 py-3 text-[15px] text-sam-fg outline-none ring-sam-primary/25 placeholder:text-sam-muted focus:border-sam-primary focus:ring-2"
                disabled={busy}
              />
              <span className="mt-1 block text-right text-[12px] text-sam-muted">{message.length}/500</span>
            </label>

            {error ? (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] text-sam-danger dark:bg-red-950/40">{error}</p>
            ) : null}
          </div>
        </div>

        {/* 하단 고정 액션 — FB식 전폭 프라이머리 + 텍스트 취소 */}
        <footer className="shrink-0 border-t border-sam-border bg-sam-surface px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="w-full rounded-[10px] bg-sam-primary py-3.5 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-sam-primary-hover disabled:opacity-50"
          >
            {busy ? "보내는 중…" : "제안 보내기"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="mt-2 w-full py-2 text-center text-[15px] font-semibold text-sam-muted hover:text-sam-fg disabled:opacity-50"
          >
            취소
          </button>
        </footer>
      </div>
    </div>
  );
}
