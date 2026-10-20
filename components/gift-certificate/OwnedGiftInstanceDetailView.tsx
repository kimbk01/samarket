"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import { MYPAGE_BODY_COLUMN_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";
import { useBottomNavOccupiesClearance } from "@/lib/layout/bottom-nav-scroll-chrome-context";
import { resolveMyStickyCtaBodyClearanceClass } from "@/lib/mypage/my-sticky-cta-placement";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { MyStickyCta } from "@/components/mypage/ds/MyStickyCta";
import { formatMypageDate, formatMypageMoney } from "@/lib/mypage/format-mypage-date";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import {
  classifyGiftInstanceDetailResponse,
  type GiftInstanceDetailLoadState,
} from "@/lib/gift-certificate/gift-instance-detail-load-state";

/** S45 상세 스켈레톤 — 카드 비주얼 블록 + 4행 + 하단 CTA 자리 */
function GiftInstanceDetailSkeleton() {
  const bone = "rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse";
  return (
    <div aria-busy="true" data-testid="gift-instance-detail-skeleton" className="space-y-4 pb-8">
      <span className={`block h-48 w-full ${bone}`} />
      <div className="overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            data-skeleton-row=""
            className="flex min-h-[48px] items-center justify-between gap-3 border-t border-sam-border-soft px-4 first:border-t-0"
          >
            <span className={`h-3.5 w-[30%] ${bone}`} />
            <span className={`h-3.5 w-[25%] ${bone}`} />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <span className={`h-[46px] flex-1 ${bone}`} />
        <span className={`h-[46px] flex-[1.2] ${bone}`} />
      </div>
    </div>
  );
}

export function OwnedGiftInstanceDetailView({ instanceId }: { instanceId: string }) {
  const { safeT, t, language } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const giftTab = (searchParams.get("giftTab")?.trim() || "owned") as GiftSubTab;
  const from = searchParams.get("from")?.trim() || null;
  const [loadState, setLoadState] = useState<GiftInstanceDetailLoadState>({ kind: "loading" });
  const instance: GiftInstanceDetail | null = loadState.kind === "ok" ? loadState.instance : null;
  const ready = loadState.kind !== "loading";
  const [sendOpen, setSendOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const backHref = canonicalHubHref("gifts", { giftTab, from });

  useCommerceChildChrome({
    titleKey: "gift_certificate_wallet_title",
    backHref,
    preferHistoryBack: true,
  });

  /**
   * 네트워크·JSON 오류도 반드시 끝난다(무한 "…" 금지) — 403 수령 대기 · 404/없음 · 오류 구분.
   */
  const load = useCallback(async () => {
    setLoadState({ kind: "loading" });
    try {
      const res = await fetch(`/api/me/gift-certificates/instances/${encodeURIComponent(instanceId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = res.status === 403 ? null : await res.json().catch(() => null);
      setLoadState(classifyGiftInstanceDetailResponse(res.status, json));
    } catch {
      setLoadState({ kind: "error" });
    }
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

  const copyNumber = async (value: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
      showMypageToast(t("mypage_oa_gift_number_copied"), "success");
    } catch {
      showMypageToast(t("mypage_oa_gift_number_copy_failed"), "error");
    }
  };

  /** 하단 고정 CTA — [주문에 사용하기](주) · [선물하기](보조, 양도 가능·ACTIVE 만). 사용 완료면 없음 */
  const showStickyCta = Boolean(instance) && !isUsed;
  const bottomNavOccupies = useBottomNavOccupiesClearance();

  return (
    <div
      className={`${MYPAGE_BODY_COLUMN_CLASS} flex min-h-0 flex-1 flex-col gap-1 pt-3 ${
        showStickyCta ? resolveMyStickyCtaBodyClearanceClass(bottomNavOccupies) : "pb-4"
      }`}
      data-owned-gift-instance-detail="1"
      data-instance-id={instanceId}
      data-ready={ready ? "1" : "0"}
      data-load-state={loadState.kind}
    >
      {loadState.kind === "loading" ? (
        <GiftInstanceDetailSkeleton />
      ) : loadState.kind === "forbidden" ? (
        <p className="text-sm text-sam-muted">
          {safeT("gift_u3_wallet_pending_lock", {
            fallbackKo: "수령 대기 중인 상품권은 선물 수락 후 확인할 수 있습니다.",
            fallbackEn: "Accept the gift to view owned instance details.",
          })}
        </p>
      ) : loadState.kind === "not_found" ? (
        <MyStateView
          kind="empty"
          empty={{
            title: t("mypage_oa_gift_not_found"),
            cta: (
              <Link href={backHref} className="sam-btn sam-btn--primary sam-btn--sm">
                {t("mypage_oa_back_to_gift_list")}
              </Link>
            ),
          }}
        />
      ) : loadState.kind === "error" || !instance ? (
        <MyStateView
          kind="error"
          error={{ message: t("mypage_oa_gift_load_failed"), onRetry: () => void load() }}
        />
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
                  className="min-h-[44px] text-sm font-medium text-signature"
                  onClick={() => void copyNumber(instance.publicGiftNumber)}
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
                        <dd className="tabular-nums text-sam-fg">{formatMypageMoney(instance.faceValue)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>
                          {safeT("commerce_hub_gift_purchase_label", {
                            fallbackKo: "구매 금액",
                            fallbackEn: "Purchase amount",
                          })}
                        </dt>
                        <dd className="tabular-nums text-sam-fg">{formatMypageMoney(instance.purchasePrice)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>
                          {safeT("commerce_hub_gift_applied_label", {
                            fallbackKo: "실제 적용 금액",
                            fallbackEn: "Applied amount",
                          })}
                        </dt>
                        <dd className="tabular-nums text-sam-fg" data-gift-history-applied="1">
                          {formatMypageMoney(r.redeemedAmount)}
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
                            {formatMypageMoney(r.forfeitedAmount)}
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
                            {formatMypageMoney(r.additionalPaymentAmount)}
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
                        <dd className="tabular-nums text-sam-fg">
                          {formatMypageDate(r.redeemedAt, { style: "datetime", lang: language }) || r.redeemedAt}
                        </dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
      {showStickyCta ? (
        <MyStickyCta
          dirty
          primary={{
            label: safeT("commerce_hub_use_on_order_cta", {
              fallbackKo: "주문에 사용하기",
              fallbackEn: "Use on order",
            }),
            onPress: () => router.push(useHref),
          }}
          secondary={
            canSend
              ? {
                  label: safeT("gift_u3_wallet_send", { fallbackKo: "선물하기", fallbackEn: "Send as gift" }),
                  onPress: () => setSendOpen(true),
                }
              : undefined
          }
        />
      ) : null}
      {sendOpen && instance ? (
        <WalletGiftFriendPicker open instanceId={instance.id} onClose={() => setSendOpen(false)} />
      ) : null}
    </div>
  );
}
