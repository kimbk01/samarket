"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { broadcastPriceOfferCreatedForProduct } from "@/lib/offers/normalize-offer-product-id";
import { getAppSettings } from "@/lib/app-settings";
import { openCreateTradeChat } from "@/lib/chats/trade-chat-entry-navigation";
import { formatPrice } from "@/lib/utils/format";
import type { PriceOfferListItem, PriceOfferStatus } from "@/lib/offers/types";

const OFFER_STATUS_KO: Record<PriceOfferStatus, string> = {
  pending: "판매자 응답 대기",
  accepted: "수락됨",
  rejected: "거절됨",
  expired: "만료",
};

type Props = {
  mode: "sent" | "received";
  title: string;
  emptyLabel: string;
};

export function MyOffersView({ mode, title, emptyLabel }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const currency = getAppSettings().defaultCurrency || "PHP";
  const [offers, setOffers] = useState<PriceOfferListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const href = mode === "sent" ? "/api/offers/mine" : "/api/offers/received";
        const res = await runSingleFlight(`my-offers:${mode}`, () =>
          fetch(href, { credentials: "include", cache: "no-store" })
        );
        const json = (await res.json().catch(() => ({}))) as { offers?: PriceOfferListItem[]; error?: string };
        if (!res.ok) {
          throw new Error(typeof json?.error === "string" ? json.error : "가격 제안을 불러오지 못했습니다.");
        }
        if (!cancelled) {
          setOffers(Array.isArray(json.offers) ? json.offers : []);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "가격 제안을 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  return (
    <div className="min-h-screen bg-sam-app px-3 py-4 sm:px-4">
      <div className="mx-auto max-w-2xl space-y-3">
        <nav className="flex flex-wrap gap-2">
          <Link
            href="/my/offers/sent"
            className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${
              pathname === "/my/offers" || pathname === "/my/offers/sent"
                ? "bg-sam-primary text-white"
                : "border border-sam-border bg-sam-surface text-sam-fg"
            }`}
          >
            내가 보낸 가격 제안
          </Link>
          <Link
            href="/my/offers/received"
            className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${
              pathname === "/my/offers/received"
                ? "bg-sam-primary text-white"
                : "border border-sam-border bg-sam-surface text-sam-fg"
            }`}
          >
            받은 가격 제안
          </Link>
        </nav>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h1 className="text-[20px] font-bold text-sam-fg">{title}</h1>
          <p className="mt-1 text-[12px] text-sam-muted">
            가격 제안은 채팅과 분리된 요청이며, 수락 시에만 기존 거래 채팅으로 연결됩니다.
          </p>
        </div>

        {loading ? <p className="text-[13px] text-sam-muted">불러오는 중…</p> : null}
        {error ? <p className="text-[13px] text-sam-danger">{error}</p> : null}
        {!loading && offers.length === 0 ? (
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-[13px] text-sam-muted">
            {emptyLabel}
          </div>
        ) : null}

        {offers.map((offer) => (
          <article key={offer.id} className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link href={offer.productHref} className="text-[15px] font-semibold text-sam-fg hover:underline">
                  {offer.productTitle}
                </Link>
                <p className="mt-1 text-[12px] text-sam-muted">
                  제안가 {formatPrice(offer.offeredPrice, currency)} / 판매가 {formatPrice(offer.originalPrice, currency)}
                </p>
                <p className="mt-1 text-[12px] text-sam-muted">
                  상태: {OFFER_STATUS_KO[offer.status] ?? offer.status}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {mode === "sent" && offer.status === "accepted" ? (
                  <button
                    type="button"
                    onClick={() => openCreateTradeChat(router, { productId: offer.productId })}
                    className="rounded-ui-rect bg-sam-primary px-3 py-2 text-[12px] font-semibold text-white"
                  >
                    채팅 이어가기
                  </button>
                ) : null}
                {mode === "received" && offer.status === "pending" ? (
                  <>
                    <button
                      type="button"
                      disabled={busyOfferId === offer.id}
                      onClick={async () => {
                        setBusyOfferId(offer.id);
                        setError("");
                        try {
                          const res = await fetch(`/api/offers/${encodeURIComponent(offer.id)}/accept`, {
                            method: "POST",
                            credentials: "include",
                          });
                          const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; offer?: PriceOfferListItem };
                          if (!res.ok || !json?.ok) {
                            setError(typeof json?.error === "string" ? json.error : "제안을 수락하지 못했습니다.");
                            return;
                          }
                          if (json.offer?.productId) {
                            broadcastPriceOfferCreatedForProduct(json.offer.productId);
                          }
                          setOffers((prev) =>
                            prev.map((item) => (item.id === offer.id ? { ...item, status: "accepted" } : item))
                          );
                        } catch {
                          setError("네트워크 오류가 발생했습니다.");
                        } finally {
                          setBusyOfferId(null);
                        }
                      }}
                      className="rounded-ui-rect bg-sam-primary px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-60"
                    >
                      수락
                    </button>
                    <button
                      type="button"
                      disabled={busyOfferId === offer.id}
                      onClick={async () => {
                        setBusyOfferId(offer.id);
                        setError("");
                        try {
                          const res = await fetch(`/api/offers/${encodeURIComponent(offer.id)}/reject`, {
                            method: "POST",
                            credentials: "include",
                          });
                          const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; offer?: PriceOfferListItem };
                          if (!res.ok || !json?.ok) {
                            setError(typeof json?.error === "string" ? json.error : "제안을 거절하지 못했습니다.");
                            return;
                          }
                          if (json.offer?.productId) {
                            broadcastPriceOfferCreatedForProduct(json.offer.productId);
                          }
                          setOffers((prev) =>
                            prev.map((item) => (item.id === offer.id ? { ...item, status: "rejected" } : item))
                          );
                        } catch {
                          setError("네트워크 오류가 발생했습니다.");
                        } finally {
                          setBusyOfferId(null);
                        }
                      }}
                      className="rounded-ui-rect border border-sam-border px-3 py-2 text-[12px] font-semibold text-sam-fg disabled:opacity-60"
                    >
                      거절
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            {offer.message ? (
              <p className="mt-3 text-[13px] leading-snug text-sam-muted">{offer.message}</p>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
