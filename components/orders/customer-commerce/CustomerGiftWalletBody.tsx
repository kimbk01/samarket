"use client";

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
import { formatGiftInstanceExpirationDisplay } from "@/lib/gift-certificate/format-gift-certificate-expiration";
import {
  CommerceHubSegmentTabs,
  CommercePrimaryCtaButton,
  CommercePrimaryCtaLink,
  CommerceSecondaryCtaLink,
} from "./CommerceHubSegmentTabs";
import { GIFT_CARD_RESPONSIVE_GRID_CLASS } from "@/lib/gift-certificate/gift-visual-layout";
import { Sam } from "@/lib/ui/sam-component-classes";
import { formatMoneyPhp } from "@/lib/utils/format";
import { giftMallShowsDiscountArrow } from "@/lib/gift-certificate/gift-certificate-visual-model";
function useGiftExpiryLabel() {
  const { safeT } = useI18n();
  return (validUntil: string | null | undefined) =>
    formatGiftInstanceExpirationDisplay({
      validUntil,
      noExpiryLabel: safeT("gift_portrait_expiry_none", {
        fallbackKo: "만료 없음",
        fallbackEn: "No expiry",
      }),
    });
}

function WalletPurchaseSecondary({
  faceValue,
  purchasePrice,
}: {
  faceValue: number;
  purchasePrice: number;
}) {
  const { safeT } = useI18n();
  if (!giftMallShowsDiscountArrow(faceValue, purchasePrice) && faceValue === purchasePrice) {
    return (
      <p className="text-xs text-sam-muted tabular-nums">
        {safeT("commerce_hub_gift_purchase_label", {
          fallbackKo: "구매가",
          fallbackEn: "Purchase price",
        })}{" "}
        {formatMoneyPhp(purchasePrice)}
      </p>
    );
  }
  if (!giftMallShowsDiscountArrow(faceValue, purchasePrice)) return null;
  return (
    <p className="text-xs text-sam-muted tabular-nums" data-gift-wallet-purchase-secondary="1">
      {safeT("gift_portrait_purchase_at_buy", {
        fallbackKo: "구매 당시",
        fallbackEn: "Purchased at",
      })}{" "}
      <span className="line-through">{formatMoneyPhp(faceValue)}</span>
      {" → "}
      <span className="font-medium text-sam-fg">{formatMoneyPhp(purchasePrice)}</span>
    </p>
  );
}
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
  onReload,
}: {
  transfer: GiftWalletTransfer;
  direction: "received" | "sent";
  onCancel?: () => void;
  onReload?: () => void;
}) {
  const { safeT } = useI18n();
  const scope = transfer.giftScope === "PLATFORM" ? "PLATFORM" : "STORE";
  const peerName =
    direction === "received" ? transfer.senderDisplayName : transfer.recipientDisplayName;
  const pending = transfer.status.toUpperCase() === "PENDING";

  async function act(kind: "accept" | "reject") {
    if (!onReload) return;
    await fetch(
      `/api/me/gift-certificates/transfers/${encodeURIComponent(transfer.id)}/${kind}`,
      { method: "POST", credentials: "include" }
    );
    onReload();
  }

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
      size="md"
      title={transfer.title}
      issuerName={transfer.storeName}
      faceValue={transfer.faceValue}
      remainingBalance={transfer.remainingBalance}
      statusLabel={transferStatusLabel(transfer.status, safeT)}
      footer={
        <div className="space-y-2">
          {peerName ? (
            <p className="text-sm text-sam-muted">
              {direction === "received"
                ? safeT("commerce_hub_transfer_from_sender", {
                    fallbackKo: "보낸 사람",
                    fallbackEn: "From",
                  })
                : safeT("commerce_hub_transfer_to_recipient", {
                    fallbackKo: "받는 사람",
                    fallbackEn: "To",
                  })}
              : <span className="font-medium text-sam-fg">{peerName}</span>
            </p>
          ) : null}
          {direction === "received" && pending ? (
            <div className="flex gap-2">
              <CommercePrimaryCtaButton
                className="min-h-[44px] flex-1 px-3"
                onClick={() => void act("accept")}
              >
                {safeT("gift_cert_chat_accept", {
                  fallbackKo: "선물 받기",
                  fallbackEn: "Accept gift",
                })}
              </CommercePrimaryCtaButton>
              <button
                type="button"
                className={`${Sam.btn.secondary} min-h-[44px] flex-1 px-3 text-sm`}
                onClick={() => void act("reject")}
              >
                {safeT("gift_cert_chat_reject", {
                  fallbackKo: "거절",
                  fallbackEn: "Decline",
                })}
              </button>
            </div>
          ) : null}
          {direction === "sent" && pending && onCancel ? (
            <button type="button" className={`${Sam.btn.secondary} min-h-[44px] w-full px-3 text-sm`} onClick={onCancel}>
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
  const formatExpiry = useGiftExpiryLabel();
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

  const ownedHref = canonicalHubHref("gifts", { giftTab: "owned", from });

  return (
    <div data-customer-gift-wallet="1" data-wallet-ready={ready ? "1" : "0"}>
      <CommerceHubSegmentTabs
        tabs={GIFT_TABS}
        activeId={giftTab}
        hrefFor={(id) => canonicalHubHref("gifts", { giftTab: id, from })}
        labelFor={(id) =>
          safeT(TAB_KEY[id], {
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
          })
        }
        countFor={(id) => counts[id]}
        dataAttr="data-gift-wallet-tab"
      />

      <div className="mb-3 flex flex-col gap-2">
        <CommercePrimaryCtaLink href={browseHref} data-gift-wallet-buy-cta="1">
          {safeT("commerce_hub_gift_buy_cta", {
            fallbackKo: "상품권 구매하기",
            fallbackEn: "Buy gift certificates",
          })}
        </CommercePrimaryCtaLink>
        <CommerceSecondaryCtaLink href={ownedHref} data-gift-wallet-owned-cta="1">
          {safeT("commerce_hub_gift_my_wallet_cta", {
            fallbackKo: "내 상품권",
            fallbackEn: "My gifts",
          })}
        </CommerceSecondaryCtaLink>
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
          <ul className={GIFT_CARD_RESPONSIVE_GRID_CLASS}>
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
                    size="md"
                    title={row.title}
                    issuerName={row.storeName}
                    faceValue={row.faceValue}
                    remainingBalance={row.remainingBalance}
                    purchasePrice={row.purchasePrice}
                    publicGiftNumber={row.publicGiftNumber}
                    showGiftNumber={Boolean(row.publicGiftNumber?.trim())}
                    expirationDisplay={formatExpiry(row.validUntil)}
                    showValidity
                    statusLabel={
                      locked
                        ? safeT("gift_u3_wallet_pending_lock", {
                            fallbackKo: "수령 대기 중",
                            fallbackEn: "Awaiting accept",
                          })
                        : undefined
                    }
                    detailHref={ownedGiftInstanceHref(row.id, { from, giftTab: "owned" })}
                    showSend={canSend}
                    onSend={() => setSendInstanceId(row.id)}
                    sendDisabled={!canSend}
                    footer={<WalletPurchaseSecondary faceValue={row.faceValue} purchasePrice={row.purchasePrice} />}
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
          <ul className={GIFT_CARD_RESPONSIVE_GRID_CLASS}>
            {wallet.pendingTransfers.map((t) => (
              <li key={t.id}>
                <TransferCard transfer={t} direction="received" onReload={reload} />
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
          <ul className={GIFT_CARD_RESPONSIVE_GRID_CLASS}>
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
                size="md"
                faded
                title={row.title}
                issuerName={row.storeName}
                faceValue={row.faceValue}
                remainingBalance={0}
                expirationDisplay={formatExpiry(row.validUntil)}
                showValidity
                detailHref={ownedGiftInstanceHref(row.id, { from, giftTab: "used" })}
                footer={
                  row.latestRedemptionStoreName ? (
                    <p className="text-xs text-sam-muted">
                      {safeT("commerce_hub_used_latest_store", {
                        fallbackKo: "최근 사용 매장",
                        fallbackEn: "Last used at",
                      })}
                      : {row.latestRedemptionStoreName}
                    </p>
                  ) : undefined
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
