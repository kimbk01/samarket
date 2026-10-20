import type { AppLanguageCode } from "./config";
import { adminMessages } from "./catalog/admin";
import { adminOsLaunchMessages } from "./catalog/admin-os-launch";
import { adminFinanceSsot19Messages } from "./catalog/admin-finance-ssot19";
import { adminLaunchIntroMessages } from "./catalog/admin-launch-intro";
import { adminPlatformPromotionNotificationsMessages } from "./catalog/admin-platform-promotion-notifications";
import { adminDeployMessages } from "./catalog/admin-deploy";
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
import { adminDeliveryOpsUxMessages } from "./catalog/admin-delivery-ops-ux";
import { adminChatR1EMessages } from "./catalog/admin-chat-r1-media";
import { adminChatR1DMessages } from "./catalog/admin-chat-r1-dashboard";
import { adminChatR1CMessages } from "./catalog/admin-chat-r1-pages";
import { adminChatR1BMessages } from "./catalog/admin-chat-r1-data";
import { adminChatR1AMessages } from "./catalog/admin-chat-r1-access";
import { adminDeliveryR4EMessages } from "./catalog/admin-delivery-r4-app-sync";
import { adminDeliveryR4DMessages } from "./catalog/admin-delivery-r4-field-monitoring";
import { adminDeliveryR4CMessages } from "./catalog/admin-delivery-r4-fees-settings";
import { adminDeliveryR4BMessages } from "./catalog/admin-delivery-r4-orders";
import { adminDeliveryR4AMessages } from "./catalog/admin-delivery-r4-stores";
import { adminCommunityR4Messages } from "./catalog/admin-community-r4";
import { adminTradeAdminMessages } from "./catalog/admin-trade-admin";
import { adminShellFrameMessages } from "./catalog/admin-shell-frame";
import { adminDashboardV4Messages } from "./catalog/admin-dashboard-v4";
import { adminF3MypageToolsMessages } from "./catalog/admin-f3-mypage-tools";
import { adminMenuJAmd5Messages } from "./catalog/admin-menu-j-amd-5";
import { adminTechInfoMessages } from "./catalog/admin-tech-info";
import { chatsMessages } from "./catalog/chats";
import { ptrMessages } from "./catalog/ptr";
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
import { platformEventsUiMessages } from "./catalog/platform-events-ui";
import { adminActionQueueMessages } from "./catalog/admin-action-queue";
import koJson from "@/messages/ko.json";
import enJson from "@/messages/en.json";

import type { MessageKey } from "./message-key";
export type { MessageKey } from "./message-key";

type LocaleMessageBag = { readonly [K in MessageKey]: string };

/** Public MESSAGES shape — serializable; preserves MessageKey, values as string. */
export type MessagesTable = {
  readonly ko: LocaleMessageBag;
  readonly en: LocaleMessageBag;
};

/** Runtime KO bag — explicit LocaleMessageBag annotation avoids TS7056 on as-const emit. */
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
  ...ptrMessages.ko,
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
  ...platformEventsUiMessages.ko,
  ...adminActionQueueMessages.ko,
  ...adminMessages.ko,
  ...adminOsLaunchMessages.ko,
  ...adminFinanceSsot19Messages.ko,
  ...adminLaunchIntroMessages.ko,
  ...adminPlatformPromotionNotificationsMessages.ko,
  ...adminDeployMessages.ko,
  ...koJson,
  // 배달 Admin 운영 UX 교정 — ko.json 보다 뒤 (같은 키 교정 우선)
  ...adminDeliveryOpsUxMessages.ko,
  ...adminChatR1EMessages.ko,
  ...adminChatR1DMessages.ko,
  ...adminChatR1CMessages.ko,
  ...adminChatR1BMessages.ko,
  ...adminChatR1AMessages.ko,
  ...adminDeliveryR4EMessages.ko,
  ...adminDeliveryR4DMessages.ko,
  ...adminDeliveryR4CMessages.ko,
  ...adminDeliveryR4BMessages.ko,
  ...adminDeliveryR4AMessages.ko,
  ...adminCommunityR4Messages.ko,
  ...adminTradeAdminMessages.ko,
  ...adminShellFrameMessages.ko,
  ...adminDashboardV4Messages.ko,
  ...adminF3MypageToolsMessages.ko,
  ...adminMenuJAmd5Messages.ko,
  ...adminTechInfoMessages.ko,
} as LocaleMessageBag;

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
  ...ptrMessages.en,
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
  ...platformEventsUiMessages.en,
  ...adminActionQueueMessages.en,
  ...adminMessages.en,
  ...adminOsLaunchMessages.en,
  ...adminFinanceSsot19Messages.en,
  ...adminLaunchIntroMessages.en,
  ...adminPlatformPromotionNotificationsMessages.en,
  ...adminDeployMessages.en,
  ...enJson,
  ...adminDeliveryOpsUxMessages.en,
  ...adminChatR1EMessages.en,
  ...adminChatR1DMessages.en,
  ...adminChatR1CMessages.en,
  ...adminChatR1BMessages.en,
  ...adminChatR1AMessages.en,
  ...adminDeliveryR4EMessages.en,
  ...adminDeliveryR4DMessages.en,
  ...adminDeliveryR4CMessages.en,
  ...adminDeliveryR4BMessages.en,
  ...adminDeliveryR4AMessages.en,
  ...adminCommunityR4Messages.en,
  ...adminTradeAdminMessages.en,
  ...adminShellFrameMessages.en,
  ...adminDashboardV4Messages.en,
  ...adminF3MypageToolsMessages.en,
  ...adminMenuJAmd5Messages.en,
  ...adminTechInfoMessages.en,
} as LocaleMessageBag;

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
