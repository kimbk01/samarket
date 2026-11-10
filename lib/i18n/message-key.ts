/**
 * MessageKey SSOT — union of catalog/json keyofs.
 * Kept separate from the runtime merge bag so declaration emit does not hit TS7056
 * on a single giant `as const` object (tsconfig.app / tsconfig.test composite).
 */
import { adminMessages } from "./catalog/admin";
import { adminOsLaunchMessages } from "./catalog/admin-os-launch";
import { adminFinanceSsot19Messages } from "./catalog/admin-finance-ssot19";
import { adminLaunchIntroMessages } from "./catalog/admin-launch-intro";
import { adminPlatformPromotionNotificationsMessages } from "./catalog/admin-platform-promotion-notifications";
import { adminDeployMessages } from "./catalog/admin-deploy";
import { adminBoostPricesMessages } from "./catalog/admin-boost-prices";
import { adminTradeSoldWindowMessages } from "./catalog/admin-trade-sold-window";
import { ownerAnnouncementsMessages } from "./catalog/owner-announcements";
import { storeApplyV2Messages } from "./catalog/store-apply-v2";
import { commonMessages } from "./catalog/common";
import { myMessages } from "./catalog/my";
import { mypageHubMessages } from "./catalog/mypage-hub";
import { adminLegalConsentMessages } from "./catalog/admin-legal-consent";
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
import { adminPermissionsLabelsMessages } from "./catalog/admin-permissions-labels";
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
import { chatsMessages } from "./catalog/chats";
import { ptrMessages } from "./catalog/ptr";
import { homeHubMessages } from "./catalog/home-hub";
import { homeHubAdminMessages } from "./catalog/home-hub-admin";
import { storeCommerceUiMessages } from "./catalog/store-commerce-ui";
import { storePartnerAgreementMessages } from "./catalog/store-partner-agreement";
import { adminStorePartnerAgreementsMessages } from "./catalog/admin-store-partner-agreements";
import { adminDeliveryLaunchMessages } from "./catalog/admin-delivery-launch";
import { adminMessengerContactsMessages } from "./catalog/admin-messenger-contacts";
import { communityMessengerContactsMessages } from "./catalog/community-messenger-contacts";
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
import { adminUsersAddressMessages } from "./catalog/admin-users-address";
import { adminTradeRadiusMessages } from "./catalog/admin-trade-radius";
import { storeOps3bMessages } from "./catalog/store-ops-3b";
import { deliveryBundle4Messages } from "./catalog/delivery-bundle4";
import { adminDeliveryAdsStage3Messages } from "./catalog/admin-delivery-ads-stage3";
import { ownerStage4FeedbackMessages } from "./catalog/owner-stage4-feedback";
import { ownerStage4NavMessages } from "./catalog/owner-stage4-nav";
import { ownerStage4RoutesMessages } from "./catalog/owner-stage4-routes";
import { ownerUiCopyKeysMessages } from "./catalog/owner-ui-copy-keys";
import { adminDeliveryOpsUxMessages } from "./catalog/admin-delivery-ops-ux";
import { adminChatR1CMessages } from "./catalog/admin-chat-r1-pages";
import { adminChatR1BMessages } from "./catalog/admin-chat-r1-data";
import { adminChatR1AMessages } from "./catalog/admin-chat-r1-access";
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
import { adminIaR1Messages } from "./catalog/admin-ia-r1";
import { adminDashboardChatTabMessages } from "./catalog/admin-dashboard-chat-tab";
import { popupSsotWordingMessages } from "./catalog/popup-ssot-wording";
import { adsImpl1104PromotionMessages } from "./catalog/ads-impl-1104-p";
import { adsImpl1104FeedMessages } from "./catalog/ads-impl-1104-f";
import { adsImpl1104SurfaceMessages } from "./catalog/ads-impl-1104-u";
import { adsImpl1104AdminMessages } from "./catalog/ads-impl-1104-a";
import { adsImpl1104IntroMessages } from "./catalog/ads-impl-1104-i";
import { adsImpl1107MoneyMessages } from "./catalog/ads-impl-1107-w1";
import { adsImpl1107PopupMessages } from "./catalog/ads-impl-1107-w2";
import { adsImpl1107DeliveryMessages } from "./catalog/ads-impl-1107-w3";
import { adsImpl1107LedgerMessages } from "./catalog/ads-impl-1107-r1";
import { adsImpl1107DeleteMessages } from "./catalog/ads-impl-1107-r2";
import { adminConsoleCoreMessages } from "./catalog/admin-console-core";
import { appShellCoreMessages } from "./catalog/app-shell-core";
import { copyLibMessages } from "./catalog/copy-lib";
import { copyAdminMessages } from "./catalog/copy-admin";
import { copyAdminL25JsxAMessages } from "./catalog/copy-admin-l25-jsx-a";
import { copyAdminL25JsxBMessages } from "./catalog/copy-admin-l25-jsx-b";
import { copyUiL25JsxMessages } from "./catalog/copy-ui-l25-jsx";
import { copyAdminL25CommunityAMessages } from "./catalog/copy-admin-l25-community-a";
import { copyAdminL25CommunityBMessages } from "./catalog/copy-admin-l25-community-b";
import { copyAdminL25TradeMessages } from "./catalog/copy-admin-l25-trade";
import { copyAdminL25MiscMessages } from "./catalog/copy-admin-l25-misc";
import { copyAdminL25LibMessages } from "./catalog/copy-admin-l25-lib";
import { copyAdminL25AdsMessages } from "./catalog/copy-admin-l25-ads";
import { copyAdminL25OpsMessages } from "./catalog/copy-admin-l25-ops";
import { copyAdminB4StoresMessages } from "./catalog/copy-admin-b4-stores";
import { copyAdminB4AdsMessages } from "./catalog/copy-admin-b4-ads";
import { copyAdminB4CommunityMessages } from "./catalog/copy-admin-b4-community";
import { copyAdminB4CoreMessages } from "./catalog/copy-admin-b4-core";
import { copyAdminB4OrdersMessages } from "./catalog/copy-admin-b4-orders";
import { copyAdminB4FinanceMessages } from "./catalog/copy-admin-b4-finance";
import { copyAdminB4Ops1Messages } from "./catalog/copy-admin-b4-ops1";
import { copyAdminB4Ops2Messages } from "./catalog/copy-admin-b4-ops2";
import { copyLibB4Messages } from "./catalog/copy-lib-b4";
import { copyAuthMessages } from "./catalog/copy-auth";
import { copyMessengerMessages } from "./catalog/copy-messenger";
import { copyOwnerMessages } from "./catalog/copy-owner";
import { copyStoreMessages } from "./catalog/copy-store";
import { copyTradeMessages } from "./catalog/copy-trade";
import { copyShellMessages } from "./catalog/copy-shell";

type KeyOf<T> = keyof T & string;

/** Canonical KO key authority (catalogs only — S5). */
export type MessageKey =
  | KeyOf<typeof adminDeliveryOpsUxMessages.ko>
  | KeyOf<typeof adminChatR1CMessages.ko>
  | KeyOf<typeof adminChatR1BMessages.ko>
  | KeyOf<typeof adminChatR1AMessages.ko>
  | KeyOf<typeof adminDeliveryR4DMessages.ko>
  | KeyOf<typeof adminDeliveryR4CMessages.ko>
  | KeyOf<typeof adminDeliveryR4BMessages.ko>
  | KeyOf<typeof adminDeliveryR4AMessages.ko>
  | KeyOf<typeof adminCommunityR4Messages.ko>
  | KeyOf<typeof adminTradeAdminMessages.ko>
  | KeyOf<typeof adminShellFrameMessages.ko>
  | KeyOf<typeof adminDashboardV4Messages.ko>
  | KeyOf<typeof adminF3MypageToolsMessages.ko>
  | KeyOf<typeof adminMenuJAmd5Messages.ko>
  | KeyOf<typeof adminTechInfoMessages.ko>
  | KeyOf<typeof adminIaR1Messages.ko>
  | KeyOf<typeof adminDashboardChatTabMessages.ko>
  | KeyOf<typeof popupSsotWordingMessages.ko>
  | KeyOf<typeof adsImpl1104PromotionMessages.ko>
  | KeyOf<typeof adsImpl1104FeedMessages.ko>
  | KeyOf<typeof adsImpl1104SurfaceMessages.ko>
  | KeyOf<typeof adsImpl1104AdminMessages.ko>
  | KeyOf<typeof adsImpl1104IntroMessages.ko>
  | KeyOf<typeof adsImpl1107MoneyMessages.ko>
  | KeyOf<typeof adsImpl1107PopupMessages.ko>
  | KeyOf<typeof adsImpl1107DeliveryMessages.ko>
  | KeyOf<typeof adsImpl1107LedgerMessages.ko>
  | KeyOf<typeof adsImpl1107DeleteMessages.ko>
  | KeyOf<typeof commonMessages.ko>
  | KeyOf<typeof myMessages.ko>
  | KeyOf<typeof mypageHubMessages.ko>
  | KeyOf<typeof adminLegalConsentMessages.ko>
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
  | KeyOf<typeof storeCouponOwnerFeedbackMessages.ko>
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
  | KeyOf<typeof storeOrderStageTermsMessages.ko>
  | KeyOf<typeof navigationMessages.ko>
  | KeyOf<typeof notificationMessages.ko>
  | KeyOf<typeof chatsMessages.ko>
  | KeyOf<typeof ptrMessages.ko>
  | KeyOf<typeof homeHubMessages.ko>
  | KeyOf<typeof homeHubAdminMessages.ko>
  | KeyOf<typeof storeCommerceUiMessages.ko>
  | KeyOf<typeof storePartnerAgreementMessages.ko>
  | KeyOf<typeof adminStorePartnerAgreementsMessages.ko>
  | KeyOf<typeof adminDeliveryLaunchMessages.ko>
  | KeyOf<typeof adminMessengerContactsMessages.ko>
  | KeyOf<typeof communityMessengerContactsMessages.ko>
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
  | KeyOf<typeof platformEventsUiMessages.ko>
  | KeyOf<typeof adminActionQueueMessages.ko>
  | KeyOf<typeof adminUsersAddressMessages.ko>
  | KeyOf<typeof adminTradeRadiusMessages.ko>
  | KeyOf<typeof storeOps3bMessages.ko>
  | KeyOf<typeof deliveryBundle4Messages.ko>
  | KeyOf<typeof adminDeliveryAdsStage3Messages.ko>
  | KeyOf<typeof ownerStage4FeedbackMessages.ko>
  | KeyOf<typeof ownerStage4NavMessages.ko>
  | KeyOf<typeof ownerStage4RoutesMessages.ko>
  | KeyOf<typeof ownerUiCopyKeysMessages.ko>
  | KeyOf<typeof adminMessages.ko>
  | KeyOf<typeof adminOsLaunchMessages.ko>
  | KeyOf<typeof adminFinanceSsot19Messages.ko>
  | KeyOf<typeof adminLaunchIntroMessages.ko>
  | KeyOf<typeof adminPlatformPromotionNotificationsMessages.ko>
  | KeyOf<typeof adminDeployMessages.ko>
  | KeyOf<typeof adminBoostPricesMessages.ko>
  | KeyOf<typeof adminTradeSoldWindowMessages.ko>
  | KeyOf<typeof ownerAnnouncementsMessages.ko>
  | KeyOf<typeof storeApplyV2Messages.ko>
  | KeyOf<typeof adminConsoleCoreMessages.ko>
  | KeyOf<typeof copyShellMessages.ko>
  | KeyOf<typeof copyTradeMessages.ko>
  | KeyOf<typeof copyStoreMessages.ko>
  | KeyOf<typeof copyOwnerMessages.ko>
  | KeyOf<typeof copyMessengerMessages.ko>
  | KeyOf<typeof copyAuthMessages.ko>
  | KeyOf<typeof copyAdminMessages.ko>
  | KeyOf<typeof copyAdminL25JsxAMessages.ko>
  | KeyOf<typeof copyAdminL25JsxBMessages.ko>
  | KeyOf<typeof copyUiL25JsxMessages.ko>
  | KeyOf<typeof copyAdminL25CommunityAMessages.ko>
  | KeyOf<typeof copyAdminL25CommunityBMessages.ko>
  | KeyOf<typeof copyAdminL25TradeMessages.ko>
  | KeyOf<typeof copyAdminL25MiscMessages.ko>
  | KeyOf<typeof copyAdminL25LibMessages.ko>
  | KeyOf<typeof copyAdminL25AdsMessages.ko>
  | KeyOf<typeof copyAdminL25OpsMessages.ko>
  | KeyOf<typeof copyAdminB4StoresMessages.ko>
  | KeyOf<typeof copyAdminB4AdsMessages.ko>
  | KeyOf<typeof copyAdminB4CommunityMessages.ko>
  | KeyOf<typeof copyAdminB4CoreMessages.ko>
  | KeyOf<typeof copyAdminB4OrdersMessages.ko>
  | KeyOf<typeof copyAdminB4FinanceMessages.ko>
  | KeyOf<typeof copyAdminB4Ops1Messages.ko>
  | KeyOf<typeof copyAdminB4Ops2Messages.ko>
  | KeyOf<typeof copyLibB4Messages.ko>
  | KeyOf<typeof copyLibMessages.ko>
  | KeyOf<typeof appShellCoreMessages.ko>;

/** EN sources — used only for compile-time KO/EN key parity. */
type EnMessageKey =
  | KeyOf<typeof commonMessages.en>
  | KeyOf<typeof myMessages.en>
  | KeyOf<typeof mypageHubMessages.en>
  | KeyOf<typeof adminLegalConsentMessages.en>
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
  | KeyOf<typeof storeCouponOwnerFeedbackMessages.en>
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
  | KeyOf<typeof storeOrderStageTermsMessages.en>
  | KeyOf<typeof navigationMessages.en>
  | KeyOf<typeof notificationMessages.en>
  | KeyOf<typeof chatsMessages.en>
  | KeyOf<typeof ptrMessages.en>
  | KeyOf<typeof homeHubMessages.en>
  | KeyOf<typeof homeHubAdminMessages.en>
  | KeyOf<typeof storeCommerceUiMessages.en>
  | KeyOf<typeof storePartnerAgreementMessages.en>
  | KeyOf<typeof adminStorePartnerAgreementsMessages.en>
  | KeyOf<typeof adminDeliveryLaunchMessages.en>
  | KeyOf<typeof adminMessengerContactsMessages.en>
  | KeyOf<typeof communityMessengerContactsMessages.en>
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
  | KeyOf<typeof platformEventsUiMessages.en>
  | KeyOf<typeof adminActionQueueMessages.en>
  | KeyOf<typeof adminUsersAddressMessages.en>
  | KeyOf<typeof adminTradeRadiusMessages.en>
  | KeyOf<typeof storeOps3bMessages.en>
  | KeyOf<typeof deliveryBundle4Messages.en>
  | KeyOf<typeof adminDeliveryAdsStage3Messages.en>
  | KeyOf<typeof ownerStage4FeedbackMessages.en>
  | KeyOf<typeof ownerStage4NavMessages.en>
  | KeyOf<typeof ownerStage4RoutesMessages.en>
  | KeyOf<typeof ownerUiCopyKeysMessages.en>
  | KeyOf<typeof adminMessages.en>
  | KeyOf<typeof adminOsLaunchMessages.en>
  | KeyOf<typeof adminFinanceSsot19Messages.en>
  | KeyOf<typeof adminLaunchIntroMessages.en>
  | KeyOf<typeof adminPlatformPromotionNotificationsMessages.en>
  | KeyOf<typeof adminDeployMessages.en>
  | KeyOf<typeof adminBoostPricesMessages.en>
  | KeyOf<typeof adminTradeSoldWindowMessages.en>
  | KeyOf<typeof ownerAnnouncementsMessages.en>
  | KeyOf<typeof storeApplyV2Messages.en>
  | KeyOf<typeof adminDeliveryOpsUxMessages.en>
  | KeyOf<typeof adminChatR1CMessages.en>
  | KeyOf<typeof adminChatR1BMessages.en>
  | KeyOf<typeof adminChatR1AMessages.en>
  | KeyOf<typeof adminDeliveryR4DMessages.en>
  | KeyOf<typeof adminDeliveryR4CMessages.en>
  | KeyOf<typeof adminDeliveryR4BMessages.en>
  | KeyOf<typeof adminDeliveryR4AMessages.en>
  | KeyOf<typeof adminCommunityR4Messages.en>
  | KeyOf<typeof adminTradeAdminMessages.en>
  | KeyOf<typeof adminShellFrameMessages.en>
  | KeyOf<typeof adminDashboardV4Messages.en>
  | KeyOf<typeof adminF3MypageToolsMessages.en>
  | KeyOf<typeof adminMenuJAmd5Messages.en>
  | KeyOf<typeof adminTechInfoMessages.en>
  | KeyOf<typeof adminIaR1Messages.en>
  | KeyOf<typeof adminDashboardChatTabMessages.en>
  | KeyOf<typeof popupSsotWordingMessages.en>
  | KeyOf<typeof adsImpl1104PromotionMessages.en>
  | KeyOf<typeof adsImpl1104FeedMessages.en>
  | KeyOf<typeof adsImpl1104SurfaceMessages.en>
  | KeyOf<typeof adsImpl1104AdminMessages.en>
  | KeyOf<typeof adsImpl1104IntroMessages.en>
  | KeyOf<typeof adsImpl1107MoneyMessages.en>
  | KeyOf<typeof adsImpl1107PopupMessages.en>
  | KeyOf<typeof adsImpl1107DeliveryMessages.en>
  | KeyOf<typeof adsImpl1107LedgerMessages.en>
  | KeyOf<typeof adsImpl1107DeleteMessages.en>
  | KeyOf<typeof adminConsoleCoreMessages.en>
  | KeyOf<typeof copyShellMessages.en>
  | KeyOf<typeof copyTradeMessages.en>
  | KeyOf<typeof copyStoreMessages.en>
  | KeyOf<typeof copyOwnerMessages.en>
  | KeyOf<typeof copyMessengerMessages.en>
  | KeyOf<typeof copyAuthMessages.en>
  | KeyOf<typeof copyAdminMessages.en>
  | KeyOf<typeof copyAdminL25JsxAMessages.en>
  | KeyOf<typeof copyAdminL25JsxBMessages.en>
  | KeyOf<typeof copyUiL25JsxMessages.en>
  | KeyOf<typeof copyAdminL25CommunityAMessages.en>
  | KeyOf<typeof copyAdminL25CommunityBMessages.en>
  | KeyOf<typeof copyAdminL25TradeMessages.en>
  | KeyOf<typeof copyAdminL25MiscMessages.en>
  | KeyOf<typeof copyAdminL25LibMessages.en>
  | KeyOf<typeof copyAdminL25AdsMessages.en>
  | KeyOf<typeof copyAdminL25OpsMessages.en>
  | KeyOf<typeof copyAdminB4StoresMessages.en>
  | KeyOf<typeof copyAdminB4AdsMessages.en>
  | KeyOf<typeof copyAdminB4CommunityMessages.en>
  | KeyOf<typeof copyAdminB4CoreMessages.en>
  | KeyOf<typeof copyAdminB4OrdersMessages.en>
  | KeyOf<typeof copyAdminB4FinanceMessages.en>
  | KeyOf<typeof copyAdminB4Ops1Messages.en>
  | KeyOf<typeof copyAdminB4Ops2Messages.en>
  | KeyOf<typeof copyLibB4Messages.en>
  | KeyOf<typeof copyLibMessages.en>
  | KeyOf<typeof appShellCoreMessages.en>;

type _MissingInEn = Exclude<MessageKey, EnMessageKey>;
type _ExtraInEn = Exclude<EnMessageKey, MessageKey>;
type _LocaleKeyParityDrift = _MissingInEn | _ExtraInEn;
type _AssertLocaleKeyParity = [_LocaleKeyParityDrift] extends [never] ? true : false;
export const _assertLocaleKeyParity: _AssertLocaleKeyParity = true;
