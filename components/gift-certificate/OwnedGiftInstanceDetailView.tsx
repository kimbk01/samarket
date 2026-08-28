"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { GiftVisualCard } from "@/components/gift-certificate/GiftVisualCard";
import { WalletGiftFriendPicker } from "@/components/gift-certificate/WalletGiftFriendPicker";
import { useCommerceChildChrome } from "@/lib/delivery/customer/commerce-child-chrome";
import type { GiftInstanceDetail } from "@/lib/gift-certificate/load-gift-instance-detail";
import {
  canonicalHubHref,
  deliveryDiscoveryHref,
  type GiftSubTab,
} from "@/lib/delivery/customer/commerce-hub-nav";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { Sam } from "@/lib/ui/sam-component-classes";

export function OwnedGiftInstanceDetailView({ instanceId }: { instanceId: string }) {
  const { safeT } = useI18n();
  const searchParams = useSearchParams();
  const giftTab = (searchParams.get("giftTab")?.trim() || "owned") as GiftSubTab;
  const from = searchParams.get("from")?.trim() || null;
  const [instance, setInstance] = useState<GiftInstanceDetail | null>(null);
  const [ready, setReady] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const backHref = canonicalHubHref("gifts", { giftTab, from });

  useCommerceChildChrome({
    titleKey: "gift_certificate_wallet_title",
    backHref,
    preferHistoryBack: true,
  });

  const load = useCallback(async () => {
    setReady(false);
    const res = await fetch(`/api/me/gift-certificates/instances/${encodeURIComponent(instanceId)}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (res.status === 403) {
      setForbidden(true);
      setInstance(null);
      setReady(true);
      return;
    }
    const json = (await res.json()) as { ok?: boolean; instance?: GiftInstanceDetail };
    setInstance(json.ok ? json.instance ?? null : null);
    setForbidden(false);
    setReady(true);
  }, [instanceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const useHref = useMemo(() => {
    if (!instance) return deliveryDiscoveryHref();
    if (instance.giftScope === "PLATFORM") return deliveryDiscoveryHref();
    if (instance.storeSlug?.trim()) return `/stores/${encodeURIComponent(instance.storeSlug.trim())}`;
    return deliveryDiscoveryHref();
  }, [instance]);

  const canSend =
    instance &&
    instance.transferable &&
    instance.remainingBalance > 0 &&
    instance.status !== "GIFT_LOCKED" &&
    instance.status !== "FULLY_REDEEMED";

  return (
    <div
      className={APP_MAIN_TAB_SCROLL_BODY_CLASS}
      data-owned-gift-instance-detail="1"
      data-instance-id={instanceId}
      data-ready={ready ? "1" : "0"}
    >
      {!ready ? (
        <div className="flex min-h-[30vh] items-center justify-center text-sm text-sam-muted">…</div>
      ) : forbidden ? (
        <p className="text-sm text-sam-muted">
          {safeT("gift_u3_wallet_pending_lock", {
            fallbackKo: "수령 대기 중인 상품권은 선물 수락 후 확인할 수 있습니다.",
            fallbackEn: "Accept the gift to view owned instance details.",
          })}
        </p>
      ) : !instance ? (
        <p className="text-sm text-sam-muted">
          {safeT("gift_cert_chat_card_invalid", {
            fallbackKo: "상품권 정보를 불러올 수 없습니다",
            fallbackEn: "Gift certificate details unavailable",
          })}
        </p>
      ) : (
        <div className="space-y-4 pb-8">
          <GiftVisualCard
            visual={{
              giftScope: instance.giftScope,
              imageUrl: instance.imageUrl,
              storeLogoUrl: instance.storeLogoUrl,
              storeName: instance.storeName,
              title: instance.title,
            }}
            surface="instance"
            title={instance.title}
            issuerName={instance.storeName}
            faceValue={instance.faceValue}
            remainingBalance={instance.remainingBalance}
            publicGiftNumber={instance.publicGiftNumber}
            showGiftNumber={Boolean(instance.publicGiftNumber?.trim())}
            showSend={Boolean(canSend)}
            onSend={() => setSendOpen(true)}
          />
          {instance.publicGiftNumber ? (
            <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-sm">
              <span className="text-sam-muted">
                {safeT("gift_u2_public_number_label", {
                  fallbackKo: "상품권 번호",
                  fallbackEn: "Gift number",
                })}
              </span>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="font-medium tabular-nums text-sam-fg">{instance.publicGiftNumber}</span>
                <button
                  type="button"
                  className="text-sm font-medium text-signature"
                  onClick={() => {
                    void navigator.clipboard?.writeText(instance.publicGiftNumber).catch(() => {});
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied
                    ? safeT("gift_u2_public_number_copied", { fallbackKo: "복사됨", fallbackEn: "Copied" })
                    : safeT("gift_u2_public_number_copy", { fallbackKo: "번호 복사", fallbackEn: "Copy number" })}
                </button>
              </div>
            </div>
          ) : null}
          {instance.status === "GIFT_LOCKED" ? (
            <p className="text-sm font-medium text-sam-danger">
              {safeT("gift_u3_wallet_pending_lock", {
                fallbackKo: "수령 대기 중",
                fallbackEn: "Awaiting accept",
              })}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Link href={useHref} prefetch={false} className={`${Sam.btn.primary} inline-flex min-h-[48px] items-center px-4 text-sm`}>
              {safeT("commerce_hub_use_on_order_cta", {
                fallbackKo: "주문에 사용하기",
                fallbackEn: "Use on order",
              })}
            </Link>
            {canSend ? (
              <button
                type="button"
                className={`${Sam.btn.secondary} inline-flex min-h-[48px] items-center px-4 text-sm`}
                onClick={() => setSendOpen(true)}
              >
                {safeT("gift_u3_wallet_send", { fallbackKo: "선물하기", fallbackEn: "Send as gift" })}
              </button>
            ) : null}
          </div>
          {instance.redemptionHistory.length > 0 ? (
            <section data-gift-redemption-history="1">
              <h2 className="mb-2 text-sm font-semibold text-sam-fg">
                {safeT("commerce_hub_redemption_history", {
                  fallbackKo: "사용 내역",
                  fallbackEn: "Redemption history",
                })}
              </h2>
              <ul className="space-y-2">
                {instance.redemptionHistory.map((r) => (
                  <li
                    key={`${r.storeId}-${r.redeemedAt}`}
                    className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm"
                  >
                    <p className="font-medium text-sam-fg">{r.storeName}</p>
                    <p className="tabular-nums text-sam-muted">
                      {r.redeemedAmount.toLocaleString()} · {r.redeemedAt}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
      {sendOpen && instance ? (
        <WalletGiftFriendPicker open instanceId={instance.id} onClose={() => setSendOpen(false)} />
      ) : null}
    </div>
  );
}
