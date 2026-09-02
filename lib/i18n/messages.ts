import type { AppLanguageCode } from "./config";
import { adminMessages } from "./catalog/admin";
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
import { neighborhoodMeetingEventsMessages } from "./catalog/neighborhood-meeting-events";
import { tradeUsedCarMessages } from "./catalog/trade-used-car";
import { tradeWriteFormMessages } from "./catalog/trade-write-form";
import { jobsWriteFormMessages } from "./catalog/jobs-write-form";
import { exchangeWriteFormMessages } from "./catalog/exchange-write-form";
import { cmHomeListMessages } from "./catalog/cm-home-list";
import { personalizedFeedMessages } from "./catalog/personalized-feed";
import { businessAdminNavMessages } from "./catalog/business-admin-nav";
import { storeCouponSsotMessages } from "./catalog/store-coupon-ssot";
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
import { adminPermissionsLabelsMessages } from "./catalog/admin-permissions-labels";
import { launchReadinessLabelsMessages } from "./catalog/launch-readiness-labels";
import { opsRoutinesLabelsMessages } from "./catalog/ops-routines-labels";
import { productionMigrationLabelsMessages } from "./catalog/production-migration-labels";
import { tradePostAdLabelsMessages } from "./catalog/trade-post-ad-labels";
import { myManagedCtaLabelsMessages } from "./catalog/my-managed-cta-labels";
import { cmFriendAddCtaLabelsMessages } from "./catalog/cm-friend-add-cta-labels";
import { feedEmergencyLabelsMessages } from "./catalog/feed-emergency-labels";
import { storeOrderChatSummaryLabelsMessages } from "./catalog/store-order-chat-summary-labels";
import { navigationMessages } from "./catalog/navigation";
import { notificationMessages } from "./catalog/notifications";
import { chatsMessages } from "./catalog/chats";
import { storeCommerceUiMessages } from "./catalog/store-commerce-ui";
import { cmMonitoringSloMessages } from "./catalog/cm-monitoring-slo";
import { communityMessengerUiMessages } from "./catalog/community-messenger-ui";
import { communityUiMessages } from "./catalog/community-ui";
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
import koJson from "@/messages/ko.json";
import enJson from "@/messages/en.json";

/** Canonical KO bag — MessageKey authority (not exported). Runtime merge unchanged. */
const KO_MESSAGES = {
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
  ...neighborhoodMeetingEventsMessages.ko,
  ...tradeUsedCarMessages.ko,
  ...tradeWriteFormMessages.ko,
  ...jobsWriteFormMessages.ko,
  ...exchangeWriteFormMessages.ko,
  ...cmHomeListMessages.ko,
  ...personalizedFeedMessages.ko,
  ...businessAdminNavMessages.ko,
  ...storeCouponSsotMessages.ko,
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
  ...adminPermissionsLabelsMessages.ko,
  ...launchReadinessLabelsMessages.ko,
  ...opsRoutinesLabelsMessages.ko,
  ...productionMigrationLabelsMessages.ko,
  ...tradePostAdLabelsMessages.ko,
  ...myManagedCtaLabelsMessages.ko,
  ...cmFriendAddCtaLabelsMessages.ko,
  ...feedEmergencyLabelsMessages.ko,
  ...storeOrderChatSummaryLabelsMessages.ko,
  ...navigationMessages.ko,
  ...notificationMessages.ko,
  ...chatsMessages.ko,
  ...storeCommerceUiMessages.ko,
  ...cmMonitoringSloMessages.ko,
  ...communityMessengerUiMessages.ko,
  ...communityUiMessages.ko,
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
  ...adminMessages.ko,
  ...koJson,
} as const;

const EN_MESSAGES = {
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
  ...neighborhoodMeetingEventsMessages.en,
  ...tradeUsedCarMessages.en,
  ...tradeWriteFormMessages.en,
  ...jobsWriteFormMessages.en,
  ...exchangeWriteFormMessages.en,
  ...cmHomeListMessages.en,
  ...personalizedFeedMessages.en,
  ...businessAdminNavMessages.en,
  ...storeCouponSsotMessages.en,
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
  ...adminPermissionsLabelsMessages.en,
  ...launchReadinessLabelsMessages.en,
  ...opsRoutinesLabelsMessages.en,
  ...productionMigrationLabelsMessages.en,
  ...tradePostAdLabelsMessages.en,
  ...myManagedCtaLabelsMessages.en,
  ...cmFriendAddCtaLabelsMessages.en,
  ...feedEmergencyLabelsMessages.en,
  ...storeOrderChatSummaryLabelsMessages.en,
  ...navigationMessages.en,
  ...notificationMessages.en,
  ...chatsMessages.en,
  ...storeCommerceUiMessages.en,
  ...cmMonitoringSloMessages.en,
  ...communityMessengerUiMessages.en,
  ...communityUiMessages.en,
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
  ...adminMessages.en,
  ...enJson,
} as const;

/** Valid translation key — keyed from canonical KO merge, not exported MESSAGES. */
export type MessageKey = keyof typeof KO_MESSAGES;

type LocaleMessageBag = { readonly [K in MessageKey]: string };

/** Public MESSAGES shape — serializable; preserves MessageKey, values as string. */
export type MessagesTable = {
  readonly ko: LocaleMessageBag;
  readonly en: LocaleMessageBag;
};

type _MissingInEn = Exclude<MessageKey, keyof typeof EN_MESSAGES>;
type _ExtraInEn = Exclude<keyof typeof EN_MESSAGES, MessageKey>;
type _LocaleKeyParityDrift = _MissingInEn | _ExtraInEn;
type _AssertLocaleKeyParity = [_LocaleKeyParityDrift] extends [never] ? true : false;
const _assertLocaleKeyParity: _AssertLocaleKeyParity = true;
void _assertLocaleKeyParity;

export const MESSAGES: MessagesTable = {
  ko: KO_MESSAGES,
  en: EN_MESSAGES,
};

const REVERSE_KO_MESSAGE_KEY = Object.fromEntries(
  Object.entries(MESSAGES.ko).map(([key, value]) => [value, key as MessageKey])
) as Record<string, MessageKey>;

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
  if (primary === undefined && language === "en") {
    warnMissingKey("en", key);
  }
  if (primary === undefined && language === "ko") {
    warnMissingKey("ko", key);
  }
  const template = String(primary ?? MESSAGES.ko[key] ?? "");
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
  const key = REVERSE_KO_MESSAGE_KEY[text];
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
