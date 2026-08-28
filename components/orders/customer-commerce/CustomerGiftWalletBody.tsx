"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { GiftVisualCard } from "@/components/gift-certificate/GiftVisualCard";
import { WalletGiftFriendPicker } from "@/components/gift-certificate/WalletGiftFriendPicker";
import { CommerceEmptyState } from "./CommerceEmptyState";
import {
  markCommerceHubFetchUnauthed,
  useCommerceHubTabFetch,
} from "./useCommerceHubTabFetch";
import {
  canonicalHubHref,
  giftMallHref,
  ownedGiftInstanceHref,
  type GiftSubTab,
} from "@/lib/delivery/customer/commerce-hub-nav";
import type { GiftWalletPayload, GiftWalletTransfer } from "@/lib/gift-certificate/load-gift-wallet";
import { Sam } from "@/lib/ui/sam-component-classes";

const GIFT_TABS: GiftSubTab[] = ["owned", "received", "sent", "used"];

const TAB_KEY: Record<
  GiftSubTab,
  | "commerce_hub_gift_tab_owned"
  | "commerce_hub_gift_tab_received"
  | "commerce_hub_gift_tab_sent"
  | "commerce_hub_gift_tab_used"
> = {
  owned: "commerce_hub_gift_tab_owned",
  received: "commerce_hub_gift_tab_received",
  sent: "commerce_hub_gift_tab_sent",
  used: "commerce_hub_gift_tab_used",
};

async function fetchWallet(signal: AbortSignal): Promise<{ authed: boolean; wallet: GiftWalletPayload | null }> {
  const res = await fetch("/api/me/gift-certificates/wallet", {
    credentials: "include",
    cache: "no-store",
    signal,
  });
  if (res.status === 401) {
    markCommerceHubFetchUnauthed("commerce-hub:gifts");
    return { authed: false, wallet: null };
  }
  const json = (await res.json()) as { ok?: boolean; wallet?: GiftWalletPayload };
  return { authed: true, wallet: json.ok ? json.wallet ?? null : null };
}

function transferStatusLabel(
  status: string,
  safeT: ReturnType<typeof useI18n>["safeT"]
): string {
  const s = status.toUpperCase();
  if (s === "PENDING") {
    return safeT("commerce_hub_transfer_status_pending", {
      fallbackKo: "받기 대기",
      fallbackEn: "Awaiting accept",
    });
  }
  if (s === "ACCEPTED") {
    return safeT("commerce_hub_transfer_status_accepted", {
      fallbackKo: "수령 완료",
      fallbackEn: "Accepted",
    });
  }
  if (s === "REJECTED") {
    return safeT("commerce_hub_transfer_status_rejected", {
      fallbackKo: "거절됨",
      fallbackEn: "Declined",
    });
  }
  if (s === "CANCELLED") {
    return safeT("commerce_hub_transfer_status_cancelled", {
      fallbackKo: "취소됨",
      fallbackEn: "Cancelled",
    });
  }
  return status;
}

function TransferCard({
  transfer,
  direction,
  onCancel,
}: {
  transfer: GiftWalletTransfer;
  direction: "received" | "sent";
  onCancel?: () => void;
}) {
  const { safeT } = useI18n();
  const scope = transfer.giftScope === "PLATFORM" ? "PLATFORM" : "STORE";
  const peerName =
    direction === "received" ? transfer.senderDisplayName : transfer.recipientDisplayName;

  return (
    <GiftVisualCard
      visual={{
        giftScope: scope,
        imageUrl: transfer.imageUrl,
        storeLogoUrl: transfer.storeLogoUrl,
        storeName: transfer.storeName,
        title: transfer.title,
      }}
      surface="transfer"
      title={transfer.title}
      issuerName={transfer.storeName}
      faceValue={transfer.faceValue}
      remainingBalance={transfer.remainingBalance}
      footer={
        <div className="space-y-1 text-xs text-sam-muted">
          <p>{transferStatusLabel(transfer.status, safeT)}</p>
          {peerName ? (
            <p>
              {direction === "received"
                ? safeT("commerce_hub_transfer_from_sender", {
                    fallbackKo: "보낸 사람",
                    fallbackEn: "From",
                  })
                : safeT("commerce_hub_transfer_to_recipient", {
                    fallbackKo: "받는 사람",
                    fallbackEn: "To",
                  })}
              : {peerName}
            </p>
          ) : null}
          {direction === "sent" && transfer.status.toUpperCase() === "PENDING" && onCancel ? (
            <button type="button" className="text-sm font-medium text-signature" onClick={onCancel}>
              {safeT("gift_u3_wallet_cancel_gift", {
                fallbackKo: "선물 취소",
                fallbackEn: "Cancel gift",
              })}
            </button>
          ) : null}
        </div>
      }
    />
  );
}

/** Gifts tab body — URL `giftTab` is source of truth. */
export function CustomerGiftWalletBody({
  giftTab,
  from,
  refresh = false,
}: {
  giftTab: GiftSubTab;
  from?: string | null;
  refresh?: boolean;
}) {
  const { safeT } = useI18n();
  const [sendInstanceId, setSendInstanceId] = useState<string | null>(null);
  const { data, ready, authed, reload } = useCommerceHubTabFetch({
    cacheKey: "commerce-hub:gifts",
    enabled: true,
    refresh,
    fetcher: fetchWallet,
  });

  const wallet = data?.wallet ?? null;
  const isAuthed = data?.authed ?? authed;
  const browseHref = giftMallHref({ from });

  const ownedRows = useMemo(() => {
    if (!wallet) return [];
    return [...wallet.available, ...wallet.locked];
  }, [wallet]);

  const counts = useMemo(
    () => ({
      owned: ownedRows.length,
      received: wallet?.pendingTransfers.length ?? 0,
      sent: wallet?.sentTransfers.length ?? 0,
      used: wallet?.fullyRedeemed.length ?? 0,
    }),
    [wallet, ownedRows.length]
  );

  return (
    <div data-customer-gift-wallet="1" data-wallet-ready={ready ? "1" : "0"}>
      <div className="mb-3">
        <Link
          href={browseHref}
          prefetch={false}
          className={`${Sam.btn.secondary} inline-flex min-h-[40px] items-center justify-center px-3 text-sm`}
          data-gift-wallet-mall-cta="1"
        >
          {safeT("commerce_hub_gift_browse_cta", {
            fallbackKo: "상품권 둘러보기",
            fallbackEn: "Browse gift certificates",
          })}
        </Link>
      </div>
      <div
        className="mb-3 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4"
        data-gift-wallet-tabs="1"
        role="tablist"
      >
        {GIFT_TABS.map((id) => {
          const selected = giftTab === id;
          const href = canonicalHubHref("gifts", { giftTab: id, from });
          return (
            <Link
              key={id}
              href={href}
              prefetch={false}
              role="tab"
              aria-selected={selected}
              data-gift-wallet-tab={id}
              className={`flex min-h-[48px] min-w-0 items-center justify-center gap-1 rounded-ui-rect px-2 text-sm font-medium ${
                selected ? "bg-signature text-white" : "border border-sam-border bg-sam-surface text-sam-fg"
              }`}
            >
              <span className="min-w-0 truncate">
                {safeT(TAB_KEY[id], {
                  fallbackKo:
                    id === "owned"
                      ? "보유"
                      : id === "received"
                        ? "받은 선물"
                        : id === "sent"
                          ? "보낸 선물"
                          : "사용 완료",
                  fallbackEn:
                    id === "owned" ? "Owned" : id === "received" ? "Received" : id === "sent" ? "Sent" : "Used",
                })}
              </span>
              {counts[id] > 0 ? <span className="tabular-nums">{counts[id]}</span> : null}
            </Link>
          );
        })}
      </div>
      {!ready ? (
        <div className="flex min-h-[24vh] items-center justify-center text-sm text-sam-muted">…</div>
      ) : !isAuthed ? (
        <p className="text-sm text-sam-muted">
          {safeT("gift_certificate_wallet_login", {
            fallbackKo: "로그인하면 상품권을 볼 수 있습니다.",
            fallbackEn: "Sign in to see your gift certificates.",
          })}
        </p>
      ) : giftTab === "owned" ? (
        ownedRows.length === 0 ? (
          <CommerceEmptyState
            title={safeT("commerce_hub_gifts_empty_owned_title", {
              fallbackKo: "보유한 상품권이 없습니다.",
              fallbackEn: "You don't have any gift certificates yet.",
            })}
            ctaHref={browseHref}
            ctaLabel={safeT("commerce_hub_gift_browse_cta", {
              fallbackKo: "상품권 둘러보기",
              fallbackEn: "Browse gift certificates",
            })}
          />
        ) : (
          <ul className="min-w-0 space-y-3 pb-8">
            {ownedRows.map((row) => {
              const locked = row.status === "GIFT_LOCKED";
              const canSend = row.transferable && !locked && row.remainingBalance > 0;
              return (
                <li key={row.id}>
                  <GiftVisualCard
                    visual={{
                      giftScope: row.giftScope,
                      imageUrl: row.imageUrl,
                      storeLogoUrl: row.storeLogoUrl,
                      storeName: row.storeName,
                      title: row.title,
                    }}
                    surface="wallet"
                    title={row.title}
                    issuerName={row.storeName}
                    faceValue={row.faceValue}
                    remainingBalance={row.remainingBalance}
                    footer={
                      <div className="flex flex-wrap gap-3">
                        <Link
                          href={ownedGiftInstanceHref(row.id, { from, giftTab: "owned" })}
                          prefetch={false}
                          className="text-sm font-medium text-signature"
                          data-gift-wallet-detail-cta={row.id}
                        >
                          {safeT("gift_u2_wallet_detail_cta", {
                            fallbackKo: "상품권 상세",
                            fallbackEn: "Gift details",
                          })}
                        </Link>
                        {canSend ? (
                          <button
                            type="button"
                            className="text-sm font-medium text-signature"
                            onClick={() => setSendInstanceId(row.id)}
                          >
                            {safeT("gift_u3_wallet_send", {
                              fallbackKo: "선물하기",
                              fallbackEn: "Send as gift",
                            })}
                          </button>
                        ) : null}
                      </div>
                    }
                  />
                </li>
              );
            })}
          </ul>
        )
      ) : giftTab === "received" ? (
        !wallet || wallet.pendingTransfers.length === 0 ? (
          <CommerceEmptyState
            title={safeT("gift_certificate_wallet_empty", {
              fallbackKo: "표시할 상품권이 없습니다.",
              fallbackEn: "No gift certificates to show.",
            })}
          />
        ) : (
          <ul className="min-w-0 space-y-3 pb-8">
            {wallet.pendingTransfers.map((t) => (
              <li key={t.id}>
                <TransferCard transfer={t} direction="received" />
              </li>
            ))}
          </ul>
        )
      ) : giftTab === "sent" ? (
        !wallet || wallet.sentTransfers.length === 0 ? (
          <CommerceEmptyState
            title={safeT("gift_certificate_wallet_empty", {
              fallbackKo: "표시할 상품권이 없습니다.",
              fallbackEn: "No gift certificates to show.",
            })}
          />
        ) : (
          <ul className="min-w-0 space-y-3 pb-8">
            {wallet.sentTransfers.map((t) => (
              <li key={t.id}>
                <TransferCard
                  transfer={t}
                  direction="sent"
                  onCancel={() => {
                    void (async () => {
                      if (
                        !window.confirm(
                          safeT("gift_u3_card_cancel_confirm", {
                            fallbackKo: "상품권 선물을 취소할까요?",
                            fallbackEn: "Cancel this gift offer?",
                          })
                        )
                      ) {
                        return;
                      }
                      await fetch(
                        `/api/me/gift-certificates/transfers/${encodeURIComponent(t.id)}/cancel`,
                        { method: "POST", credentials: "include" }
                      );
                      reload();
                    })();
                  }}
                />
              </li>
            ))}
          </ul>
        )
      ) : !wallet || wallet.fullyRedeemed.length === 0 ? (
        <CommerceEmptyState
          title={safeT("gift_certificate_wallet_empty", {
            fallbackKo: "표시할 상품권이 없습니다.",
            fallbackEn: "No gift certificates to show.",
          })}
        />
      ) : (
        <ul className="min-w-0 space-y-3 pb-8">
          {wallet.fullyRedeemed.map((row) => (
            <li key={row.id}>
              <GiftVisualCard
                visual={{
                  giftScope: row.giftScope,
                  imageUrl: row.imageUrl,
                  storeLogoUrl: row.storeLogoUrl,
                  storeName: row.storeName,
                  title: row.title,
                }}
                surface="used"
                title={row.title}
                issuerName={row.storeName}
                faceValue={row.faceValue}
                remainingBalance={0}
                footer={
                  row.latestRedemptionStoreName ? (
                    <p className="text-xs text-sam-muted">
                      {safeT("commerce_hub_used_latest_store", {
                        fallbackKo: "최근 사용 매장",
                        fallbackEn: "Last used at",
                      })}
                      : {row.latestRedemptionStoreName}
                    </p>
                  ) : null
                }
              />
            </li>
          ))}
        </ul>
      )}
      {sendInstanceId ? (
        <WalletGiftFriendPicker
          open
          instanceId={sendInstanceId}
          onClose={() => {
            setSendInstanceId(null);
            reload();
          }}
        />
      ) : null}
    </div>
  );
}
