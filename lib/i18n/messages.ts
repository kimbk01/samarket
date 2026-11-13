import type { AppLanguageCode } from "./config";
import { adminMemberSharedMessages } from "./catalog/admin-member-shared";
import { ownerAnnouncementsMessages } from "./catalog/owner-announcements";
import { storeApplyV2Messages } from "./catalog/store-apply-v2";
import { commonMessages } from "./catalog/common";
import { myMessages } from "./catalog/my";
import { mypageHubMessages } from "./catalog/mypage-hub";
import { settingsUiMessages } from "./catalog/settings-ui";
import { mypageRoutesMessages } from "./catalog/mypage-routes";
import { mypageComponentsMessages } from "./catalog/mypage-components";
import { tradeMessages } from "./catalog/trade";
import { tradeReviewMessages } from "./catalog/trade-review";
import { postAdsUserMessages } from "./catalog/post-ads-user";
import { mypageMobileNavMessages } from "./catalog/mypage-mobile-nav";
import { jobsFormMessages } from "./catalog/jobs-form";
import { priceOffersMessages } from "./catalog/price-offers";
import { tradeUsedCarMessages } from "./catalog/trade-used-car";
import { tradeWriteFormMessages } from "./catalog/trade-write-form";
import { jobsWriteFormMessages } from "./catalog/jobs-write-form";
import { exchangeWriteFormMessages } from "./catalog/exchange-write-form";
import { cmHomeListMessages } from "./catalog/cm-home-list";
import { personalizedFeedMessages } from "./catalog/personalized-feed";
import { businessAdminNavMessages } from "./catalog/business-admin-nav";
import { storeCouponSsotMessages } from "./catalog/store-coupon-ssot";
import { storeCouponOwnerFeedbackMessages } from "./catalog/store-coupon-owner-feedback";
import { ownerDeliveryAdsMessages } from "./catalog/owner-delivery-ads";
import { deliveryAdsPerformanceMessages } from "./catalog/delivery-ads-performance";
import { deliveryAdsPlacementPreviewMessages } from "./catalog/delivery-ads-placement-preview";
import { commerceHubMessages } from "./catalog/commerce-hub";
import { giftCertificateU1Messages } from "./catalog/gift-certificate-u1";
import { giftCertificateU2Messages } from "./catalog/gift-certificate-u2";
import { giftCertificateU3Messages } from "./catalog/gift-certificate-u3";
import { giftCertificateU4Messages } from "./catalog/gift-certificate-u4";
import { giftCertificateU5Messages } from "./catalog/gift-certificate-u5";
import { giftCertificateU6Messages } from "./catalog/gift-certificate-u6";
import { giftOpsCenterMessages } from "./catalog/gift-ops-center";
import { giftCertificateOwnerO16Messages } from "./catalog/gift-certificate-owner-o16";
import { pointsLabelsMessages } from "./catalog/points-labels";
import { postListPreviewMessages } from "./catalog/post-list-preview";
import { categoryLabelsMessages } from "./catalog/category-labels";
import { messengerIaMessages } from "./catalog/messenger-ia";
import { releaseArchiveLabelsMessages } from "./catalog/release-archive-labels";
import { adApplicationLabelsMessages } from "./catalog/ad-application-labels";
import { launchWeekLabelsMessages } from "./catalog/launch-week-labels";
import { launchReadinessLabelsMessages } from "./catalog/launch-readiness-labels";
import { opsRoutinesLabelsMessages } from "./catalog/ops-routines-labels";
import { productionMigrationLabelsMessages } from "./catalog/production-migration-labels";
import { tradePostAdLabelsMessages } from "./catalog/trade-post-ad-labels";
import { myManagedCtaLabelsMessages } from "./catalog/my-managed-cta-labels";
import { cmFriendAddCtaLabelsMessages } from "./catalog/cm-friend-add-cta-labels";
import { feedEmergencyLabelsMessages } from "./catalog/feed-emergency-labels";
import { storeOrderChatSummaryLabelsMessages } from "./catalog/store-order-chat-summary-labels";
import { storeOrderStageTermsMessages } from "./catalog/store-order-stage-terms";
import { navigationMessages } from "./catalog/navigation";
import { notificationMessages } from "./catalog/notifications";
import { popupSsotWordingMessages } from "./catalog/popup-ssot-wording";
import { adsImpl1104PromotionMessages } from "./catalog/ads-impl-1104-p";
import { adsImpl1104FeedMessages } from "./catalog/ads-impl-1104-f";
import { adsImpl1104SurfaceMessages } from "./catalog/ads-impl-1104-u";
import { adsImpl1104AdminMessages } from "./catalog/ads-impl-1104-a";
import { adsImpl1104IntroMessages } from "./catalog/ads-impl-1104-i";
import { adsImpl1107MoneyMessages } from "./catalog/ads-impl-1107-w1";
import { adsImpl1107PopupMessages } from "./catalog/ads-impl-1107-w2";
import { adsImpl1107DeliveryMessages } from "./catalog/ads-impl-1107-w3";
import { memberIdV3Messages } from "./catalog/member-id-v3";
import { adsImpl1107LedgerMessages } from "./catalog/ads-impl-1107-r1";
import { adsImpl1107DeleteMessages } from "./catalog/ads-impl-1107-r2";
import { chatsMessages } from "./catalog/chats";
import { ptrMessages } from "./catalog/ptr";
import { moimCoreMessages } from "./catalog/moim-core";
import { moimScreensMessages } from "./catalog/moim-screens";
import { moimManageMessages } from "./catalog/moim-manage";
import { homeHubMessages } from "./catalog/home-hub";
import { storeCommerceUiMessages } from "./catalog/store-commerce-ui";
import { storePartnerAgreementMessages } from "./catalog/store-partner-agreement";
import { communityMessengerContactsMessages } from "./catalog/community-messenger-contacts";
import { cmMonitoringSloMessages } from "./catalog/cm-monitoring-slo";
import { communityMessengerUiMessages } from "./catalog/community-messenger-ui";
import { communityUiMessages } from "./catalog/community-ui";
import { shareMessages } from "./catalog/share";
import { shareInviteMessages } from "./catalog/share-invite";
import { philifeMessages } from "./catalog/philife";
import { businessMessages } from "./catalog/business";
import { ownerProductOptionsMessages } from "./catalog/owner-product-options";
import { authUiMessages } from "./catalog/auth-ui";
import { uiPhaseFinishMessages } from "./catalog/ui-phase-finish";
import { uiFinishPagesMessages } from "./catalog/ui-finish-pages";
import { addressesUiMessages } from "./catalog/addresses-ui";
import { pointsUiMessages } from "./catalog/points-ui";
import { permissionEducationMessages } from "./catalog/permission-education";
import { tradeLocationScopeMessages } from "./catalog/trade-location-scope";
import { supportUiMessages } from "./catalog/support-ui";
import { platformPopupUiMessages } from "./catalog/platform-popup-ui";
import { platformPopupOwnerMessages } from "./catalog/platform-popup-owner";
import { platformEventsUiMessages } from "./catalog/platform-events-ui";
import { storeOps3bMessages } from "./catalog/store-ops-3b";
import { deliveryBundle4Messages } from "./catalog/delivery-bundle4";
import { ownerStage4FeedbackMessages } from "./catalog/owner-stage4-feedback";
import { ownerStage4NavMessages } from "./catalog/owner-stage4-nav";
import { ownerStage4RoutesMessages } from "./catalog/owner-stage4-routes";
import { ownerUiCopyKeysMessages } from "./catalog/owner-ui-copy-keys";
import { appShellCoreMessages } from "./catalog/app-shell-core";
import { copyLibMessages } from "./catalog/copy-lib";
import { copyUiL25JsxMessages } from "./catalog/copy-ui-l25-jsx";
import { copyLibB4Messages } from "./catalog/copy-lib-b4";
import { copyAuthMessages } from "./catalog/copy-auth";
import { copyMessengerMessages } from "./catalog/copy-messenger";
import { copyOwnerMessages } from "./catalog/copy-owner";
import { copyStoreMessages } from "./catalog/copy-store";
import { copyTradeMessages } from "./catalog/copy-trade";
import { copyShellMessages } from "./catalog/copy-shell";

import type { MessageKey } from "./message-key";
export type { MessageKey } from "./message-key";

type LocaleMessageBag = { readonly [K in MessageKey]: string };

/** Public MESSAGES shape — serializable; preserves MessageKey, values as string. */
export type MessagesTable = {
  readonly ko: LocaleMessageBag;
  readonly en: LocaleMessageBag;
};

/**
 * Runtime KO bag — explicit LocaleMessageBag annotation avoids TS7056 on as-const emit.
 * C4 (Owner 「C4 구현 승인」 2026-11-12): 언어별 묶음은 처음 쓰일 때 1회만 합친다 — 화면은 한 언어만 쓰므로
 * 시작 때 두 언어를 모두 합치던 비용(샤오미 첫 진입 측정)을 줄인다. 결과·우선순위(뒤가 이김)는 그대로.
 */
function buildKoMessages(): LocaleMessageBag {
  return {
  ...adminMemberSharedMessages.ko,
  ...commonMessages.ko,
  ...myMessages.ko,
  ...mypageHubMessages.ko,
  ...settingsUiMessages.ko,
  ...mypageRoutesMessages.ko,
  ...mypageComponentsMessages.ko,
  ...tradeMessages.ko,
  ...tradeReviewMessages.ko,
  ...postAdsUserMessages.ko,
  ...mypageMobileNavMessages.ko,
  ...jobsFormMessages.ko,
  ...priceOffersMessages.ko,
  ...tradeUsedCarMessages.ko,
  ...tradeWriteFormMessages.ko,
  ...jobsWriteFormMessages.ko,
  ...exchangeWriteFormMessages.ko,
  ...cmHomeListMessages.ko,
  ...personalizedFeedMessages.ko,
  ...businessAdminNavMessages.ko,
  ...storeCouponSsotMessages.ko,
  ...storeCouponOwnerFeedbackMessages.ko,
  ...ownerDeliveryAdsMessages.ko,
  ...deliveryAdsPerformanceMessages.ko,
  ...deliveryAdsPlacementPreviewMessages.ko,
  ...commerceHubMessages.ko,
  ...giftCertificateU1Messages.ko,
  ...giftCertificateU2Messages.ko,
  ...giftCertificateU3Messages.ko,
  ...giftCertificateU4Messages.ko,
  ...giftCertificateU5Messages.ko,
  ...giftCertificateU6Messages.ko,
  ...giftOpsCenterMessages.ko,
  ...giftCertificateOwnerO16Messages.ko,
  ...pointsLabelsMessages.ko,
  ...postListPreviewMessages.ko,
  ...categoryLabelsMessages.ko,
  ...messengerIaMessages.ko,
  ...releaseArchiveLabelsMessages.ko,
  ...adApplicationLabelsMessages.ko,
  ...launchWeekLabelsMessages.ko,
  ...launchReadinessLabelsMessages.ko,
  ...opsRoutinesLabelsMessages.ko,
  ...productionMigrationLabelsMessages.ko,
  ...tradePostAdLabelsMessages.ko,
  ...myManagedCtaLabelsMessages.ko,
  ...cmFriendAddCtaLabelsMessages.ko,
  ...feedEmergencyLabelsMessages.ko,
  ...storeOrderChatSummaryLabelsMessages.ko,
  ...storeOrderStageTermsMessages.ko,
  ...navigationMessages.ko,
  ...notificationMessages.ko,
  ...chatsMessages.ko,
  ...ptrMessages.ko,
  ...moimCoreMessages.ko,
  ...moimScreensMessages.ko,
  ...moimManageMessages.ko,
  ...homeHubMessages.ko,
  ...storeCommerceUiMessages.ko,
  ...storePartnerAgreementMessages.ko,
  ...communityMessengerContactsMessages.ko,
  ...cmMonitoringSloMessages.ko,
  ...communityMessengerUiMessages.ko,
  ...communityUiMessages.ko,
  ...shareMessages.ko,
  ...shareInviteMessages.ko,
  ...philifeMessages.ko,
  ...businessMessages.ko,
  ...ownerProductOptionsMessages.ko,
  ...authUiMessages.ko,
  ...uiPhaseFinishMessages.ko,
  ...uiFinishPagesMessages.ko,
  ...addressesUiMessages.ko,
  ...pointsUiMessages.ko,
  ...permissionEducationMessages.ko,
  ...tradeLocationScopeMessages.ko,
  ...supportUiMessages.ko,
  ...platformPopupUiMessages.ko,
  ...platformPopupOwnerMessages.ko,
  ...platformEventsUiMessages.ko,
  ...storeOps3bMessages.ko,
  ...deliveryBundle4Messages.ko,
  ...ownerStage4FeedbackMessages.ko,
  ...ownerStage4NavMessages.ko,
  ...ownerStage4RoutesMessages.ko,
  ...ownerUiCopyKeysMessages.ko,
  ...ownerAnnouncementsMessages.ko,
  ...storeApplyV2Messages.ko,
  ...appShellCoreMessages.ko,
  ...copyLibMessages.ko,
  ...copyUiL25JsxMessages.ko,
  ...copyLibB4Messages.ko,
  ...copyAuthMessages.ko,
  ...copyMessengerMessages.ko,
  ...copyOwnerMessages.ko,
  ...copyStoreMessages.ko,
  ...copyTradeMessages.ko,
  ...copyShellMessages.ko,
  // 배달 Admin 운영 UX 교정 — ko.json 보다 뒤 (같은 키 교정 우선)
  ...popupSsotWordingMessages.ko,
  ...adsImpl1104PromotionMessages.ko,
  ...adsImpl1104FeedMessages.ko,
  ...adsImpl1104SurfaceMessages.ko,
  ...adsImpl1104AdminMessages.ko,
  ...adsImpl1104IntroMessages.ko,
  ...adsImpl1107MoneyMessages.ko,
  ...adsImpl1107PopupMessages.ko,
  ...adsImpl1107DeliveryMessages.ko,
  ...memberIdV3Messages.ko,
  ...adsImpl1107LedgerMessages.ko,
  ...adsImpl1107DeleteMessages.ko,
  } as LocaleMessageBag;
}

function buildEnMessages(): LocaleMessageBag {
  return {
  ...adminMemberSharedMessages.en,
  ...commonMessages.en,
  ...myMessages.en,
  ...mypageHubMessages.en,
  ...settingsUiMessages.en,
  ...mypageRoutesMessages.en,
  ...mypageComponentsMessages.en,
  ...tradeMessages.en,
  ...tradeReviewMessages.en,
  ...postAdsUserMessages.en,
  ...mypageMobileNavMessages.en,
  ...jobsFormMessages.en,
  ...priceOffersMessages.en,
  ...tradeUsedCarMessages.en,
  ...tradeWriteFormMessages.en,
  ...jobsWriteFormMessages.en,
  ...exchangeWriteFormMessages.en,
  ...cmHomeListMessages.en,
  ...personalizedFeedMessages.en,
  ...businessAdminNavMessages.en,
  ...storeCouponSsotMessages.en,
  ...storeCouponOwnerFeedbackMessages.en,
  ...ownerDeliveryAdsMessages.en,
  ...deliveryAdsPerformanceMessages.en,
  ...deliveryAdsPlacementPreviewMessages.en,
  ...commerceHubMessages.en,
  ...giftCertificateU1Messages.en,
  ...giftCertificateU2Messages.en,
  ...giftCertificateU3Messages.en,
  ...giftCertificateU4Messages.en,
  ...giftCertificateU5Messages.en,
  ...giftCertificateU6Messages.en,
  ...giftOpsCenterMessages.en,
  ...giftCertificateOwnerO16Messages.en,
  ...pointsLabelsMessages.en,
  ...postListPreviewMessages.en,
  ...categoryLabelsMessages.en,
  ...messengerIaMessages.en,
  ...releaseArchiveLabelsMessages.en,
  ...adApplicationLabelsMessages.en,
  ...launchWeekLabelsMessages.en,
  ...launchReadinessLabelsMessages.en,
  ...opsRoutinesLabelsMessages.en,
  ...productionMigrationLabelsMessages.en,
  ...tradePostAdLabelsMessages.en,
  ...myManagedCtaLabelsMessages.en,
  ...cmFriendAddCtaLabelsMessages.en,
  ...feedEmergencyLabelsMessages.en,
  ...storeOrderChatSummaryLabelsMessages.en,
  ...storeOrderStageTermsMessages.en,
  ...navigationMessages.en,
  ...notificationMessages.en,
  ...chatsMessages.en,
  ...ptrMessages.en,
  ...moimCoreMessages.en,
  ...moimScreensMessages.en,
  ...moimManageMessages.en,
  ...homeHubMessages.en,
  ...storeCommerceUiMessages.en,
  ...storePartnerAgreementMessages.en,
  ...communityMessengerContactsMessages.en,
  ...cmMonitoringSloMessages.en,
  ...communityMessengerUiMessages.en,
  ...communityUiMessages.en,
  ...shareMessages.en,
  ...shareInviteMessages.en,
  ...philifeMessages.en,
  ...businessMessages.en,
  ...ownerProductOptionsMessages.en,
  ...authUiMessages.en,
  ...uiPhaseFinishMessages.en,
  ...uiFinishPagesMessages.en,
  ...addressesUiMessages.en,
  ...pointsUiMessages.en,
  ...permissionEducationMessages.en,
  ...tradeLocationScopeMessages.en,
  ...supportUiMessages.en,
  ...platformPopupUiMessages.en,
  ...platformPopupOwnerMessages.en,
  ...platformEventsUiMessages.en,
  ...storeOps3bMessages.en,
  ...deliveryBundle4Messages.en,
  ...ownerStage4FeedbackMessages.en,
  ...ownerStage4NavMessages.en,
  ...ownerStage4RoutesMessages.en,
  ...ownerUiCopyKeysMessages.en,
  ...ownerAnnouncementsMessages.en,
  ...storeApplyV2Messages.en,
  ...appShellCoreMessages.en,
  ...copyLibMessages.en,
  ...copyUiL25JsxMessages.en,
  ...copyLibB4Messages.en,
  ...copyAuthMessages.en,
  ...copyMessengerMessages.en,
  ...copyOwnerMessages.en,
  ...copyStoreMessages.en,
  ...copyTradeMessages.en,
  ...copyShellMessages.en,
  ...popupSsotWordingMessages.en,
  ...adsImpl1104PromotionMessages.en,
  ...adsImpl1104FeedMessages.en,
  ...adsImpl1104SurfaceMessages.en,
  ...adsImpl1104AdminMessages.en,
  ...adsImpl1104IntroMessages.en,
  ...adsImpl1107MoneyMessages.en,
  ...adsImpl1107PopupMessages.en,
  ...adsImpl1107DeliveryMessages.en,
  ...memberIdV3Messages.en,
  ...adsImpl1107LedgerMessages.en,
  ...adsImpl1107DeleteMessages.en,
  } as LocaleMessageBag;
}

let koMessagesBag: LocaleMessageBag | null = null;
let enMessagesBag: LocaleMessageBag | null = null;

export const MESSAGES: MessagesTable = {
  get ko() {
    return (koMessagesBag ??= buildKoMessages());
  },
  get en() {
    return (enMessagesBag ??= buildEnMessages());
  },
};

/** 한국어 문장 → 키 역방향 표 — `translateText`·등록에서만 쓰므로 처음 쓰일 때 1회 만든다 */
let reverseKoMessageKeyTable: Record<string, MessageKey> | null = null;
function reverseKoMessageKey(): Record<string, MessageKey> {
  reverseKoMessageKeyTable ??= Object.fromEntries(
    Object.entries(MESSAGES.ko).map(([key, value]) => [value, key as MessageKey])
  ) as Record<string, MessageKey>;
  return reverseKoMessageKeyTable;
}

/**
 * D 단계 (Owner 「정해진 설계안 순서대로」 2026-11-10): 어드민 전용 문구는 회원 화면 묶음에 싣지 않고
 * `./admin-catalog` 가 필요한 곳(서버·어드민 화면)에서만 여기로 등록한다. 이미 있는 키는 덮지 않는다(회원 문구 우선).
 */
let extraCatalogVersion = 0;
export function registerExtraMessages(ko: Record<string, string>, en: Record<string, string>): void {
  /** 역방향 표는 등록 전 회원 문구로 먼저 만든다(같은 문장이면 회원 키 우선 — 예전과 같음) */
  const reverse = reverseKoMessageKey();
  const koBag = MESSAGES.ko as unknown as Record<string, string>;
  const enBag = MESSAGES.en as unknown as Record<string, string>;
  for (const [key, value] of Object.entries(ko)) {
    if (koBag[key] === undefined) koBag[key] = value;
    if (reverse[value] === undefined) reverse[value] = key as MessageKey;
  }
  for (const [key, value] of Object.entries(en)) {
    if (enBag[key] === undefined) enBag[key] = value;
  }
  extraCatalogVersion += 1;
}

/** 등록 회차 — 화면이 다시 그려질 때 기준(언어 제공자). */
export function getExtraCatalogVersion(): number {
  return extraCatalogVersion;
}

export const I18N_CATALOG_EXTENDED_EVENT = "dibay:i18n-catalog-extended";

/**
 * 안전장치: 브라우저에서 회원 묶음에 없는 키를 찾으면 어드민 문구 묶음을 1회 늦게 불러와 등록하고,
 * 언어 제공자가 이 이벤트로 화면을 다시 그린다(빈 글자가 남지 않게). 정상이면 일어나지 않는다 —
 * 회원 화면이 쓰는 키는 `catalog/admin-member-shared.ts` 에 두는 계약(`admin-catalog-member-split.test.ts`).
 */
let adminCatalogRequested = false;
function requestAdminCatalogOnMiss(key: string): void {
  if (typeof window === "undefined" || adminCatalogRequested) return;
  adminCatalogRequested = true;
  try {
    console.info("[i18n-admin-catalog-lazy]", key);
  } catch {
    /* ignore */
  }
  void import("./admin-catalog")
    .then(() => {
      window.dispatchEvent(new Event(I18N_CATALOG_EXTENDED_EVENT));
    })
    .catch(() => {
      adminCatalogRequested = false;
    });
}

const missingKeyWarned = new Set<string>();

function warnMissingKey(language: AppLanguageCode, key: MessageKey): void {
  if (process.env.NODE_ENV === "production") return;
  const id = `${language}:${key}`;
  if (missingKeyWarned.has(id)) return;
  missingKeyWarned.add(id);
  const tag = language === "en" ? "[i18n-missing-en]" : "[i18n-missing-ko]";
  console.warn(tag, key);
}

export function translate(
  language: AppLanguageCode,
  key: MessageKey,
  vars?: Record<string, string | number>
): string {
  const primary = MESSAGES[language][key];
  if (primary === undefined) requestAdminCatalogOnMiss(key);
  if (primary === undefined && language === "en") {
    warnMissingKey("en", key);
  }
  if (primary === undefined && language === "ko") {
    warnMissingKey("ko", key);
  }
  /** 다른 언어로 대체하지 않는다 — ko·en 키 대칭은 `check:i18n` 이 보장 */
  const template = String(primary ?? "");
  if (!vars) return template;
  return Object.entries(vars).reduce<string>(
    (acc, [name, value]) => acc.replaceAll(`{${name}}`, String(value)),
    template
  );
}

export function translateText(
  language: AppLanguageCode,
  text: string,
  vars?: Record<string, string | number>
): string {
  const key = reverseKoMessageKey()[text];
  if (!key) {
    return vars
      ? Object.entries(vars).reduce<string>(
          (acc, [name, value]) => acc.replaceAll(`{${name}}`, String(value)),
          text
        )
      : text;
  }
  return translate(language, key, vars);
}

/**
 * 서버(API·서버 렌더)는 어드민 문구를 항상 갖는다 — 브라우저 묶음에서는 이 분기가 빌드 때 제거된다
 * (Next 가 클라이언트 빌드에서 `typeof window` 를 "object" 로 바꿔 죽은 분기를 지움).
 */
if (typeof window === "undefined") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- 서버 전용 등록(클라이언트 묶음 제외)
    require("./admin-catalog");
  } catch {
    /* vitest(node) 는 TS require 불가 — `tests/vitest-setup.node.ts` 가 등록한다. 운영 서버 번들은 위 require 로 등록(빌드 검증). */
  }
}
