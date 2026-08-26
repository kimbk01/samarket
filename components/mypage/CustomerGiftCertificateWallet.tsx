"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { GiftArtwork } from "@/components/gift-certificate/GiftArtwork";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import type { GiftWalletPayload } from "@/lib/gift-certificate/load-gift-wallet";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { Sam } from "@/lib/ui/sam-component-classes";

type WalletTab = "available" | "pending" | "sent" | "redeemed";

const TABS: WalletTab[] = ["available", "pending", "sent", "redeemed"];

const TAB_KEY: Record<
  WalletTab,
  | "gift_certificate_wallet_tab_available"
  | "gift_certificate_wallet_tab_pending"
  | "gift_certificate_wallet_tab_sent"
  | "gift_certificate_wallet_tab_redeemed"
> = {
  available: "gift_certificate_wallet_tab_available",
  pending: "gift_certificate_wallet_tab_pending",
  sent: "gift_certificate_wallet_tab_sent",
  redeemed: "gift_certificate_wallet_tab_redeemed",
};

function mallBrowseHref(fromDelivery: boolean) {
  return fromDelivery ? "/stores/gift-mall?from=delivery-activity" : "/stores/gift-mall";
}

export function CustomerGiftCertificateWallet() {
  const { safeT } = useI18n();
  const searchParams = useSearchParams();
  const fromDelivery = searchParams.get("from") === "delivery-activity";
  const backHref = fromDelivery ? "/orders/activity" : "/mypage";
  const [tab, setTab] = useState<WalletTab>("available");
  const [wallet, setWallet] = useState<GiftWalletPayload | null>(null);
  const [authed, setAuthed] = useState(true);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/me/gift-certificates/wallet", {
      credentials: "include",
      cache: "no-store",
    });
    if (res.status === 401) {
      setAuthed(false);
      setWallet(null);
      setReady(true);
      return;
    }
    setAuthed(true);
    const json = (await res.json()) as { ok?: boolean; wallet?: GiftWalletPayload };
    setWallet(json.ok ? json.wallet ?? null : null);
    setReady(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    if (!wallet) return { available: 0, pending: 0, sent: 0, redeemed: 0 };
    return {
      available: wallet.available.length + wallet.locked.length,
      pending: wallet.pendingTransfers.length,
      sent: wallet.sentTransfers.length,
      redeemed: wallet.fullyRedeemed.length,
    };
  }, [wallet]);

  const availableRows = useMemo(() => {
    if (!wallet) return [];
    return [...wallet.available, ...wallet.locked];
  }, [wallet]);

  const browseHref = mallBrowseHref(fromDelivery);

  return (
    <div
      className={APP_MAIN_TAB_SCROLL_BODY_CLASS}
      data-customer-gift-certificate-wallet="1"
      data-wallet-ready={ready ? "1" : "0"}
    >
      <MySubpageHeader titleKey="gift_certificate_wallet_title" backHref={backHref} />
      <div className="mb-3">
        <Link
          href={browseHref}
          prefetch={false}
          className={`${Sam.btn.secondary} inline-flex min-h-[40px] items-center justify-center px-3 text-sm`}
          data-gift-wallet-mall-cta="1"
        >
          {safeT("gift_u2_wallet_browse_cta", {
            fallbackKo: "상품권 둘러보기",
            fallbackEn: "Browse gift certificates",
          })}
        </Link>
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4" data-gift-wallet-tabs="1">
        {TABS.map((id) => {
          const selected = tab === id;
          return (
            <button
              key={id}
              type="button"
              data-gift-wallet-tab={id}
              aria-selected={selected}
              className={`flex min-h-[48px] min-w-0 items-center justify-center gap-1 rounded-ui-rect px-2 text-sm font-medium ${
                selected ? "bg-signature text-white" : "border border-sam-border bg-sam-surface text-sam-fg"
              }`}
              onClick={() => setTab(id)}
            >
              <span className="min-w-0 truncate">
                {safeT(TAB_KEY[id], {
                  fallbackKo:
                    id === "available"
                      ? "보유"
                      : id === "pending"
                        ? "받은 제안"
                        : id === "sent"
                          ? "보낸 제안"
                          : "사용 완료",
                  fallbackEn:
                    id === "available"
                      ? "Available"
                      : id === "pending"
                        ? "Pending"
                        : id === "sent"
                          ? "Sent"
                          : "Redeemed",
                })}
              </span>
              {counts[id] > 0 ? <span className="tabular-nums">{counts[id]}</span> : null}
            </button>
          );
        })}
      </div>
      {!authed ? (
        <p className="text-sm text-sam-muted">
          {safeT("gift_certificate_wallet_login", {
            fallbackKo: "로그인하면 상품권을 볼 수 있습니다.",
            fallbackEn: "Sign in to see your gift certificates.",
          })}
        </p>
      ) : tab === "available" ? (
        availableRows.length === 0 ? (
          <div className="space-y-3" data-gift-wallet-empty="1">
            <p className="text-sm text-sam-muted">
              {safeT("gift_u2_wallet_empty", {
                fallbackKo: "보유한 상품권이 없습니다.",
                fallbackEn: "You don’t have any gift certificates yet.",
              })}
            </p>
            <Link
              href={browseHref}
              prefetch={false}
              className={`${Sam.btn.primary} inline-flex min-h-[48px] items-center justify-center px-4`}
              data-gift-wallet-empty-browse="1"
            >
              {safeT("gift_u2_wallet_browse_cta", {
                fallbackKo: "상품권 둘러보기",
                fallbackEn: "Browse gift certificates",
              })}
            </Link>
          </div>
        ) : (
          <ul className="min-w-0 space-y-3 pb-8">
            {availableRows.map((row) => (
              <li
                key={row.id}
                className="flex min-w-0 gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3"
                data-gift-instance={row.id}
              >
                <GiftArtwork src={row.imageUrl} alt={row.title} size={64} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-sam-fg">
                    {row.title || safeT("gift_certificate_wallet_title", {
                      fallbackKo: "상품권",
                      fallbackEn: "Gift certificates",
                    })}
                  </p>
                  {row.storeName ? (
                    <p className="truncate text-xs text-sam-muted">{row.storeName}</p>
                  ) : null}
                  <p className="text-sm tabular-nums text-sam-fg">
                    {safeT("gift_u2_wallet_remaining", {
                      fallbackKo: "잔액",
                      fallbackEn: "Balance",
                    })}{" "}
                    {row.remainingBalance.toLocaleString()} / {row.faceValue.toLocaleString()}
                  </p>
                  <Link
                    href={`/stores/gift-mall/${encodeURIComponent(row.productId)}`}
                    prefetch={false}
                    className="mt-2 inline-flex text-sm font-medium text-signature"
                    data-gift-wallet-detail-cta={row.id}
                  >
                    {safeT("gift_u2_wallet_detail_cta", {
                      fallbackKo: "상품권 상세",
                      fallbackEn: "Gift details",
                    })}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : tab === "pending" ? (
        !wallet || wallet.pendingTransfers.length === 0 ? (
          <p className="text-sm text-sam-muted">
            {safeT("gift_certificate_wallet_empty", {
              fallbackKo: "표시할 상품권이 없습니다.",
              fallbackEn: "No gift certificates to show.",
            })}
          </p>
        ) : (
          <ul className="min-w-0 space-y-3 pb-8">
            {wallet.pendingTransfers.map((t) => (
              <li
                key={t.id}
                className="rounded-ui-rect border border-sam-border bg-sam-surface p-3"
                data-gift-transfer={t.id}
              >
                <p className="text-sm font-semibold text-sam-fg">{t.status}</p>
                <p className="text-xs text-sam-muted">{t.createdAt}</p>
              </li>
            ))}
          </ul>
        )
      ) : tab === "sent" ? (
        !wallet || wallet.sentTransfers.length === 0 ? (
          <p className="text-sm text-sam-muted">
            {safeT("gift_certificate_wallet_empty", {
              fallbackKo: "표시할 상품권이 없습니다.",
              fallbackEn: "No gift certificates to show.",
            })}
          </p>
        ) : (
          <ul className="min-w-0 space-y-3 pb-8">
            {wallet.sentTransfers.map((t) => (
              <li
                key={t.id}
                className="rounded-ui-rect border border-sam-border bg-sam-surface p-3"
                data-gift-transfer={t.id}
              >
                <p className="text-sm font-semibold text-sam-fg">{t.status}</p>
                <p className="text-xs text-sam-muted">{t.createdAt}</p>
              </li>
            ))}
          </ul>
        )
      ) : !wallet || wallet.fullyRedeemed.length === 0 ? (
        <p className="text-sm text-sam-muted">
          {safeT("gift_certificate_wallet_empty", {
            fallbackKo: "표시할 상품권이 없습니다.",
            fallbackEn: "No gift certificates to show.",
          })}
        </p>
      ) : (
        <ul className="min-w-0 space-y-3 pb-8">
          {wallet.fullyRedeemed.map((row) => (
            <li
              key={row.id}
              className="flex min-w-0 gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3"
              data-gift-instance={row.id}
            >
              <GiftArtwork src={row.imageUrl} alt={row.title} size={64} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-sam-fg">
                  {row.title || row.faceValue.toLocaleString()}
                </p>
                <p className="text-xs text-sam-muted">{row.status}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
