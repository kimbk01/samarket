/**
 * MessageKey SSOT — union of catalog/json keyofs.
 * Kept separate from the runtime merge bag so declaration emit does not hit TS7056
 * on a single giant `as const` object (tsconfig.app / tsconfig.test composite).
 */
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

type KeyOf<T> = keyof T & string;

/** Canonical KO key authority (catalogs + ko.json). */
export type MessageKey =
  | KeyOf<typeof commonMessages.ko>
  | KeyOf<typeof myMessages.ko>
  | KeyOf<typeof mypageHubMessages.ko>
  | KeyOf<typeof settingsUiMessages.ko>
  | KeyOf<typeof mypageRoutesMessages.ko>
  | KeyOf<typeof mypageComponentsMessages.ko>
  | KeyOf<typeof tradeMessages.ko>
  | KeyOf<typeof tradeReviewMessages.ko>
  | KeyOf<typeof postAdsUserMessages.ko>
  | KeyOf<typeof mypageMobileNavMessages.ko>
  | KeyOf<typeof jobsFormMessages.ko>
  | KeyOf<typeof priceOffersMessages.ko>
  | KeyOf<typeof neighborhoodMeetingEventsMessages.ko>
  | KeyOf<typeof tradeUsedCarMessages.ko>
  | KeyOf<typeof tradeWriteFormMessages.ko>
  | KeyOf<typeof jobsWriteFormMessages.ko>
  | KeyOf<typeof exchangeWriteFormMessages.ko>
  | KeyOf<typeof cmHomeListMessages.ko>
  | KeyOf<typeof personalizedFeedMessages.ko>
  | KeyOf<typeof businessAdminNavMessages.ko>
  | KeyOf<typeof storeCouponSsotMessages.ko>
  | KeyOf<typeof ownerDeliveryAdsMessages.ko>
  | KeyOf<typeof deliveryAdsPerformanceMessages.ko>
  | KeyOf<typeof deliveryAdsPlacementPreviewMessages.ko>
  | KeyOf<typeof commerceHubMessages.ko>
  | KeyOf<typeof giftCertificateU1Messages.ko>
  | KeyOf<typeof giftCertificateU2Messages.ko>
  | KeyOf<typeof giftCertificateU3Messages.ko>
  | KeyOf<typeof giftCertificateU4Messages.ko>
  | KeyOf<typeof giftCertificateU5Messages.ko>
  | KeyOf<typeof giftCertificateU6Messages.ko>
  | KeyOf<typeof giftOpsCenterMessages.ko>
  | KeyOf<typeof giftCertificateOwnerO16Messages.ko>
  | KeyOf<typeof pointsLabelsMessages.ko>
  | KeyOf<typeof postListPreviewMessages.ko>
  | KeyOf<typeof categoryLabelsMessages.ko>
  | KeyOf<typeof messengerIaMessages.ko>
  | KeyOf<typeof releaseArchiveLabelsMessages.ko>
  | KeyOf<typeof adApplicationLabelsMessages.ko>
  | KeyOf<typeof launchWeekLabelsMessages.ko>
  | KeyOf<typeof adminPermissionsLabelsMessages.ko>
  | KeyOf<typeof launchReadinessLabelsMessages.ko>
  | KeyOf<typeof opsRoutinesLabelsMessages.ko>
  | KeyOf<typeof productionMigrationLabelsMessages.ko>
  | KeyOf<typeof tradePostAdLabelsMessages.ko>
  | KeyOf<typeof myManagedCtaLabelsMessages.ko>
  | KeyOf<typeof cmFriendAddCtaLabelsMessages.ko>
  | KeyOf<typeof feedEmergencyLabelsMessages.ko>
  | KeyOf<typeof storeOrderChatSummaryLabelsMessages.ko>
  | KeyOf<typeof navigationMessages.ko>
  | KeyOf<typeof notificationMessages.ko>
  | KeyOf<typeof chatsMessages.ko>
  | KeyOf<typeof storeCommerceUiMessages.ko>
  | KeyOf<typeof cmMonitoringSloMessages.ko>
  | KeyOf<typeof communityMessengerUiMessages.ko>
  | KeyOf<typeof communityUiMessages.ko>
  | KeyOf<typeof philifeMessages.ko>
  | KeyOf<typeof businessMessages.ko>
  | KeyOf<typeof ownerProductOptionsMessages.ko>
  | KeyOf<typeof authUiMessages.ko>
  | KeyOf<typeof uiPhaseFinishMessages.ko>
  | KeyOf<typeof uiFinishPagesMessages.ko>
  | KeyOf<typeof addressesUiMessages.ko>
  | KeyOf<typeof pointsUiMessages.ko>
  | KeyOf<typeof permissionEducationMessages.ko>
  | KeyOf<typeof tradeLocationScopeMessages.ko>
  | KeyOf<typeof supportUiMessages.ko>
  | KeyOf<typeof platformPopupUiMessages.ko>
  | KeyOf<typeof platformPopupOwnerMessages.ko>
  | KeyOf<typeof adminMessages.ko>
  | KeyOf<typeof koJson>;

/** EN sources — used only for compile-time KO/EN key parity. */
type EnMessageKey =
  | KeyOf<typeof commonMessages.en>
  | KeyOf<typeof myMessages.en>
  | KeyOf<typeof mypageHubMessages.en>
  | KeyOf<typeof settingsUiMessages.en>
  | KeyOf<typeof mypageRoutesMessages.en>
  | KeyOf<typeof mypageComponentsMessages.en>
  | KeyOf<typeof tradeMessages.en>
  | KeyOf<typeof tradeReviewMessages.en>
  | KeyOf<typeof postAdsUserMessages.en>
  | KeyOf<typeof mypageMobileNavMessages.en>
  | KeyOf<typeof jobsFormMessages.en>
  | KeyOf<typeof priceOffersMessages.en>
  | KeyOf<typeof neighborhoodMeetingEventsMessages.en>
  | KeyOf<typeof tradeUsedCarMessages.en>
  | KeyOf<typeof tradeWriteFormMessages.en>
  | KeyOf<typeof jobsWriteFormMessages.en>
  | KeyOf<typeof exchangeWriteFormMessages.en>
  | KeyOf<typeof cmHomeListMessages.en>
  | KeyOf<typeof personalizedFeedMessages.en>
  | KeyOf<typeof businessAdminNavMessages.en>
  | KeyOf<typeof storeCouponSsotMessages.en>
  | KeyOf<typeof ownerDeliveryAdsMessages.en>
  | KeyOf<typeof deliveryAdsPerformanceMessages.en>
  | KeyOf<typeof deliveryAdsPlacementPreviewMessages.en>
  | KeyOf<typeof commerceHubMessages.en>
  | KeyOf<typeof giftCertificateU1Messages.en>
  | KeyOf<typeof giftCertificateU2Messages.en>
  | KeyOf<typeof giftCertificateU3Messages.en>
  | KeyOf<typeof giftCertificateU4Messages.en>
  | KeyOf<typeof giftCertificateU5Messages.en>
  | KeyOf<typeof giftCertificateU6Messages.en>
  | KeyOf<typeof giftOpsCenterMessages.en>
  | KeyOf<typeof giftCertificateOwnerO16Messages.en>
  | KeyOf<typeof pointsLabelsMessages.en>
  | KeyOf<typeof postListPreviewMessages.en>
  | KeyOf<typeof categoryLabelsMessages.en>
  | KeyOf<typeof messengerIaMessages.en>
  | KeyOf<typeof releaseArchiveLabelsMessages.en>
  | KeyOf<typeof adApplicationLabelsMessages.en>
  | KeyOf<typeof launchWeekLabelsMessages.en>
  | KeyOf<typeof adminPermissionsLabelsMessages.en>
  | KeyOf<typeof launchReadinessLabelsMessages.en>
  | KeyOf<typeof opsRoutinesLabelsMessages.en>
  | KeyOf<typeof productionMigrationLabelsMessages.en>
  | KeyOf<typeof tradePostAdLabelsMessages.en>
  | KeyOf<typeof myManagedCtaLabelsMessages.en>
  | KeyOf<typeof cmFriendAddCtaLabelsMessages.en>
  | KeyOf<typeof feedEmergencyLabelsMessages.en>
  | KeyOf<typeof storeOrderChatSummaryLabelsMessages.en>
  | KeyOf<typeof navigationMessages.en>
  | KeyOf<typeof notificationMessages.en>
  | KeyOf<typeof chatsMessages.en>
  | KeyOf<typeof storeCommerceUiMessages.en>
  | KeyOf<typeof cmMonitoringSloMessages.en>
  | KeyOf<typeof communityMessengerUiMessages.en>
  | KeyOf<typeof communityUiMessages.en>
  | KeyOf<typeof philifeMessages.en>
  | KeyOf<typeof businessMessages.en>
  | KeyOf<typeof ownerProductOptionsMessages.en>
  | KeyOf<typeof authUiMessages.en>
  | KeyOf<typeof uiPhaseFinishMessages.en>
  | KeyOf<typeof uiFinishPagesMessages.en>
  | KeyOf<typeof addressesUiMessages.en>
  | KeyOf<typeof pointsUiMessages.en>
  | KeyOf<typeof permissionEducationMessages.en>
  | KeyOf<typeof tradeLocationScopeMessages.en>
  | KeyOf<typeof supportUiMessages.en>
  | KeyOf<typeof platformPopupUiMessages.en>
  | KeyOf<typeof platformPopupOwnerMessages.en>
  | KeyOf<typeof adminMessages.en>
  | KeyOf<typeof enJson>;

type _MissingInEn = Exclude<MessageKey, EnMessageKey>;
type _ExtraInEn = Exclude<EnMessageKey, MessageKey>;
type _LocaleKeyParityDrift = _MissingInEn | _ExtraInEn;
type _AssertLocaleKeyParity = [_LocaleKeyParityDrift] extends [never] ? true : false;
export const _assertLocaleKeyParity: _AssertLocaleKeyParity = true;
