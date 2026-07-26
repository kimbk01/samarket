"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { broadcastPriceOfferCreatedForProduct } from "@/lib/offers/normalize-offer-product-id";
import { getAppSettings } from "@/lib/app-settings";
import { openCreateTradeChat } from "@/lib/chats/trade-chat-entry-navigation";
import { formatPrice, formatTimeAgo } from "@/lib/utils/format";
import type { PriceOfferListItem, PriceOfferStatus } from "@/lib/offers/types";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";

const OFFER_STATUS_KO: Record<PriceOfferStatus, string> = {
  pending: "판매자 응답 대기",
  accepted: "수락됨",
  rejected: "거절됨",
  expired: "만료",
};

function statusBadgeClass(status: PriceOfferStatus): string {
  switch (status) {
    case "pending":
      return "bg-amber-100 text-amber-900";
    case "accepted":
      return "bg-emerald-100 text-emerald-900";
    case "rejected":
      return "bg-red-100 text-red-900";
    default:
      return "bg-sam-surface-muted text-sam-muted";
  }
}

type Props = {
  mode: "sent" | "received";
  title: string;
  emptyLabel: string;
};

export function MyOffersView({ mode, title, emptyLabel }: Props) {
  const { t } = useI18n();
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
            href="/mypage/offers/sent"
            className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${
              pathname === "/mypage/offers" || pathname === "/mypage/offers/sent"
                ? "bg-sam-primary text-white"
                : "border border-sam-border bg-sam-surface text-sam-fg"
            }`}
          >
            내가 보낸 가격 제안
          </Link>
          <Link
            href="/mypage/offers/received"
            className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${
              pathname === "/mypage/offers/received"
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

        {loading ? <p className="text-[13px] text-sam-muted">{t("common_loading")}</p> : null}
        {error ? <p className="text-[13px] text-sam-danger">{error}</p> : null}
        {!loading && offers.length === 0 ? (
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-[13px] text-sam-muted">
            {emptyLabel}
          </div>
        ) : null}

        {offers.map((offer) => (
          <article key={offer.id} className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <div className="flex flex-wrap items-start gap-3">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-ui-rect bg-sam-surface-muted">
              <SamarketThumbnail
                src={offer.productThumbnailUrl}
                fill
                roundedClassName="rounded-ui-rect"
                className="bg-sam-surface-muted"
                fallbackSrc=""
                fallbackNode={
                  <div className="flex h-full w-full items-center justify-center text-[10px] text-sam-muted">
                    {t("ui_product_gallery_fallback")}
                  </div>
                }
              />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={offer.productHref} className="text-[15px] font-semibold text-sam-fg hover:underline">
                    {offer.productTitle}
                  </Link>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(offer.status)}`}
                  >
                    {OFFER_STATUS_KO[offer.status] ?? offer.status}
                  </span>
                </div>
                <p className="mt-1 text-[12px] text-sam-muted">
                  제안가 {formatPrice(offer.offeredPrice, currency)} · 판매가 {formatPrice(offer.originalPrice, currency)}
                </p>
                <p className="mt-1 text-[11px] text-sam-muted">{t("ui_offer_date_label", { time: formatTimeAgo(offer.createdAt) })}</p>
              </div>

              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                {mode === "sent" && offer.status === "pending" ? (
                  <span className="inline-flex items-center rounded-ui-rect border border-sam-border bg-sam-surface-muted px-3 py-2 text-[12px] font-semibold text-sam-muted">
                    응답 대기중
                  </span>
                ) : null}
                {mode === "sent" && offer.status === "accepted" ? (
                  <button
                    type="button"
                    onClick={() =>
                      openCreateTradeChat(router, {
                        productId: offer.productId,
                        composePreview: {
                          productTitle: offer.productTitle.trim() || "상품",
                          productThumbnail: offer.productThumbnailUrl?.trim() ?? "",
                          priceText: formatPrice(offer.originalPrice, currency),
                          sellerName: offer.sellerNickname?.trim() || "판매자",
                        },
                      })
                    }
                    className="rounded-ui-rect bg-sam-primary px-3 py-2 text-[12px] font-semibold text-white"
                  >
                    채팅 이어가기
                  </button>
                ) : null}
                {mode === "sent" && (offer.status === "rejected" || offer.status === "expired") ? (
                  <button
                    type="button"
                    onClick={() => router.push(offer.productHref)}
                    className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[12px] font-semibold text-sam-fg"
                  >
                    {t("ui_offer_retry_label")}
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
