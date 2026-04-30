"use client";

import { useEffect, useState } from "react";
import { formatPrice, formatPriceInput } from "@/lib/utils/format";
import type { PriceOfferListItem } from "@/lib/offers/types";

type Props = {
  open: boolean;
  productId: string;
  originalPrice: number;
  currency: string;
  onClose: () => void;
  onSubmitted?: (offer: PriceOfferListItem) => void;
};

export function OfferModal({ open, productId, originalPrice, currency, onClose, onSubmitted }: Props) {
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

  if (!open) return null;

  const minAllowed = Math.ceil(originalPrice * 0.5);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-md rounded-[16px] bg-sam-surface p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-bold text-sam-fg">가격 제안하기</h2>
            <p className="mt-1 text-[12px] text-sam-muted">
              판매가 {formatPrice(originalPrice, currency)} · 최소 제안가 {formatPrice(minAllowed, currency)} (판매가의
              50% 이상)
            </p>
            <p className="mt-1 text-[11px] text-sam-muted">같은 상품에는 대기 중인 제안 1건만 있을 수 있으며, 24시간 동안 최대 3회까지 보낼 수 있어요.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-[13px] text-sam-muted"
            disabled={busy}
          >
            닫기
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-[13px] font-semibold text-sam-fg">가격</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={offeredPrice}
              onChange={(e) => setOfferedPrice(formatPriceInput(e.target.value))}
              placeholder={formatPriceInput(String(minAllowed))}
              className="w-full rounded-ui-rect border border-sam-border px-3 py-2.5 text-[14px] text-sam-fg"
              disabled={busy}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[13px] font-semibold text-sam-fg">메시지 (선택)</span>
            <textarea
              rows={4}
              maxLength={500}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="판매자에게 전달할 메모를 남겨보세요."
              className="w-full rounded-ui-rect border border-sam-border px-3 py-2.5 text-[14px] text-sam-fg"
              disabled={busy}
            />
          </label>

          {error ? <p className="text-[13px] text-sam-danger">{error}</p> : null}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-ui-rect border border-sam-border px-3 py-2 text-[14px] font-semibold text-sam-fg"
          >
            취소
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
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
            }}
            className="rounded-ui-rect bg-sam-primary px-3 py-2 text-[14px] font-semibold text-white"
          >
            {busy ? "보내는 중…" : "제안 보내기"}
          </button>
        </div>
      </div>
    </div>
  );
}
