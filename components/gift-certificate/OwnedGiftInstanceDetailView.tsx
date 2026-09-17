"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { GiftVisualCard } from "@/components/gift-certificate/GiftVisualCard";
import { WalletGiftFriendPicker } from "@/components/gift-certificate/WalletGiftFriendPicker";
import { useCommerceChildChrome } from "@/lib/delivery/customer/commerce-child-chrome";
import type { GiftInstanceDetail } from "@/lib/gift-certificate/load-gift-instance-detail";
import { formatGiftInstanceExpirationDisplay } from "@/lib/gift-certificate/format-gift-certificate-expiration";
import {
  canonicalHubHref,
  deliveryDiscoveryHref,
  type GiftSubTab,
} from "@/lib/delivery/customer/commerce-hub-nav";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { CommercePrimaryCtaLink } from "@/components/orders/customer-commerce/CommerceHubSegmentTabs";

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
    instance.status === "ACTIVE";
  const isUsed = instance?.status === "FULLY_REDEEMED";

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
            size="lg"
            visual={{
              giftScope: instance.giftScope,
              imageUrl: instance.imageUrl,
              storeLogoUrl: instance.storeLogoUrl,
              storeName: instance.storeName,
              title: instance.title,
            }}
            surface={isUsed ? "used" : "instance"}
            faded={isUsed}
            title={instance.title}
            issuerName={instance.storeName}
            faceValue={instance.faceValue}
            purchasePrice={instance.purchasePrice}
            publicGiftNumber={instance.publicGiftNumber}
            showGiftNumber={Boolean(instance.publicGiftNumber?.trim())}
            expirationDisplay={formatGiftInstanceExpirationDisplay({
              validUntil: instance.validUntil,
              noExpiryLabel: safeT("gift_portrait_expiry_none", {
                fallbackKo: "만료 없음",
                fallbackEn: "No expiry",
              }),
            })}
            showValidity
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
          {!isUsed ? (
            <div className="flex flex-wrap gap-2">
              <CommercePrimaryCtaLink href={useHref} className="min-h-[48px]">
                {safeT("commerce_hub_use_on_order_cta", {
                  fallbackKo: "주문에 사용하기",
                  fallbackEn: "Use on order",
                })}
              </CommercePrimaryCtaLink>
              {canSend ? (
                <button
                  type="button"
                  className="sam-btn-secondary inline-flex min-h-[48px] items-center px-4 text-sm"
                  onClick={() => setSendOpen(true)}
                >
                  {safeT("gift_u3_wallet_send", { fallbackKo: "선물하기", fallbackEn: "Send as gift" })}
                </button>
              ) : null}
            </div>
          ) : null}
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
                    key={`${r.storeId}-${r.redeemedAt}-${r.orderId ?? ""}`}
                    className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 text-sm"
                    data-gift-history-row="1"
                  >
                    <p className="font-medium text-sam-fg">{r.storeName}</p>
                    <dl className="mt-1.5 space-y-1 text-sam-muted">
                      <div className="flex justify-between gap-3">
                        <dt>
                          {safeT("commerce_hub_gift_face_label", {
                            fallbackKo: "상품권 금액",
                            fallbackEn: "Certificate amount",
                          })}
                        </dt>
                        <dd className="tabular-nums text-sam-fg">{instance.faceValue.toLocaleString()}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>
                          {safeT("commerce_hub_gift_purchase_label", {
                            fallbackKo: "구매 금액",
                            fallbackEn: "Purchase amount",
                          })}
                        </dt>
                        <dd className="tabular-nums text-sam-fg">{instance.purchasePrice.toLocaleString()}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>
                          {safeT("commerce_hub_gift_applied_label", {
                            fallbackKo: "실제 적용 금액",
                            fallbackEn: "Applied amount",
                          })}
                        </dt>
                        <dd className="tabular-nums text-sam-fg" data-gift-history-applied="1">
                          {r.redeemedAmount.toLocaleString()}
                        </dd>
                      </div>
                      {r.forfeitedAmount > 0 ? (
                        <div className="flex justify-between gap-3">
                          <dt>
                            {safeT("commerce_hub_gift_forfeited_label", {
                              fallbackKo: "소멸 금액",
                              fallbackEn: "Forfeited amount",
                            })}
                          </dt>
                          <dd className="tabular-nums text-sam-fg" data-gift-history-forfeited="1">
                            {r.forfeitedAmount.toLocaleString()}
                          </dd>
                        </div>
                      ) : null}
                      {r.additionalPaymentAmount != null && r.additionalPaymentAmount > 0 ? (
                        <div className="flex justify-between gap-3">
                          <dt>
                            {safeT("commerce_hub_gift_additional_label", {
                              fallbackKo: "추가 결제 금액",
                              fallbackEn: "Additional payment",
                            })}
                          </dt>
                          <dd className="tabular-nums text-sam-fg" data-gift-history-additional="1">
                            {r.additionalPaymentAmount.toLocaleString()}
                          </dd>
                        </div>
                      ) : null}
                      {r.orderId ? (
                        <div className="flex justify-between gap-3">
                          <dt>
                            {safeT("commerce_hub_gift_order_label", {
                              fallbackKo: "주문",
                              fallbackEn: "Order",
                            })}
                          </dt>
                          <dd className="truncate font-mono text-xs text-sam-fg" data-gift-history-order="1">
                            {r.orderId}
                          </dd>
                        </div>
                      ) : null}
                      <div className="flex justify-between gap-3">
                        <dt>
                          {safeT("commerce_hub_gift_used_at_label", {
                            fallbackKo: "사용 일시",
                            fallbackEn: "Used at",
                          })}
                        </dt>
                        <dd className="tabular-nums text-sam-fg">{r.redeemedAt}</dd>
                      </div>
                    </dl>
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
