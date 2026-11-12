/**
 * 어드민 전용 문구 묶음 — D 단계 (Owner 「정해진 설계안 순서대로」 2026-11-10, `docs/audit/app-tab-navigation-root-cause-design-2026-11-10.md` §1-D).
 *
 * 원인(실측): 어드민 문구(키 약 1만 8천 개·약 1.8MB)가 회원 화면 공용 문구 묶음에 들어 있어, 모든 회원 화면이 매 문서마다 받아서
 * 해석했다(문구 묶음 하나 실행에 Samsung M15 0.27초·Xiaomi 0.50초).
 *
 * 이 모듈을 불러오는 곳(= 어드민 문구가 필요한 곳)만 어드민 문구를 갖는다:
 * - 서버: `lib/i18n/messages.ts` 가 서버에서만(`typeof window === "undefined"`) 불러온다 — API·서버 렌더 문구 그대로.
 * - 어드민 화면: `components/admin/AdminShell.tsx`·`AdminAccessDeniedPanel.tsx` 가 불러온다.
 * - 회원 화면에서 혹시 빠진 키를 찾으면 `messages.ts` 가 이 모듈을 늦게 불러와 등록하고 화면을 다시 그리게 한다(안전장치).
 * 회원 화면이 쓰는 키는 `catalog/admin-member-shared.ts` 에 있다(계약 테스트 `admin-catalog-member-split.test.ts`).
 */
import { adminMessages } from "./catalog/admin";
import { adminOsLaunchMessages } from "./catalog/admin-os-launch";
import { adminFinanceSsot19Messages } from "./catalog/admin-finance-ssot19";
import { adminLaunchIntroMessages } from "./catalog/admin-launch-intro";
import { adminPlatformPromotionNotificationsMessages } from "./catalog/admin-platform-promotion-notifications";
import { adminDeployMessages } from "./catalog/admin-deploy";
import { adminBoostPricesMessages } from "./catalog/admin-boost-prices";
import { adminTradeSoldWindowMessages } from "./catalog/admin-trade-sold-window";
import { adminLegalConsentMessages } from "./catalog/admin-legal-consent";
import { adminPermissionsLabelsMessages } from "./catalog/admin-permissions-labels";
import { adminDeliveryOpsUxMessages } from "./catalog/admin-delivery-ops-ux";
import { adminIaR1Messages } from "./catalog/admin-ia-r1";
import { adminDashboardChatTabMessages } from "./catalog/admin-dashboard-chat-tab";
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
import { homeHubAdminMessages } from "./catalog/home-hub-admin";
import { adminMemberIdV3Messages } from "./catalog/admin-member-id-v3";
import { adminStorePartnerAgreementsMessages } from "./catalog/admin-store-partner-agreements";
import { adminDeliveryLaunchMessages } from "./catalog/admin-delivery-launch";
import { adminMessengerContactsMessages } from "./catalog/admin-messenger-contacts";
import { adminActionQueueMessages } from "./catalog/admin-action-queue";
import { adminMoimMessages } from "./catalog/admin-moim";
import { adminUsersAddressMessages } from "./catalog/admin-users-address";
import { adminTradeRadiusMessages } from "./catalog/admin-trade-radius";
import { adminDeliveryAdsStage3Messages } from "./catalog/admin-delivery-ads-stage3";
import { adminConsoleCoreMessages } from "./catalog/admin-console-core";
import { copyAdminMessages } from "./catalog/copy-admin";
import { copyAdminL25JsxAMessages } from "./catalog/copy-admin-l25-jsx-a";
import { copyAdminL25JsxBMessages } from "./catalog/copy-admin-l25-jsx-b";
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
import { registerExtraMessages } from "./messages";

const ADMIN_KO = {
  ...adminMessages.ko,
  ...adminOsLaunchMessages.ko,
  ...adminFinanceSsot19Messages.ko,
  ...adminLaunchIntroMessages.ko,
  ...adminPlatformPromotionNotificationsMessages.ko,
  ...adminDeployMessages.ko,
  ...adminBoostPricesMessages.ko,
  ...adminTradeSoldWindowMessages.ko,
  ...adminLegalConsentMessages.ko,
  ...adminPermissionsLabelsMessages.ko,
  ...adminDeliveryOpsUxMessages.ko,
  ...adminIaR1Messages.ko,
  ...adminDashboardChatTabMessages.ko,
  ...adminChatR1CMessages.ko,
  ...adminChatR1BMessages.ko,
  ...adminChatR1AMessages.ko,
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
  ...homeHubAdminMessages.ko,
  ...adminMemberIdV3Messages.ko,
  ...adminStorePartnerAgreementsMessages.ko,
  ...adminDeliveryLaunchMessages.ko,
  ...adminMessengerContactsMessages.ko,
  ...adminActionQueueMessages.ko,
  ...adminMoimMessages.ko,
  ...adminUsersAddressMessages.ko,
  ...adminTradeRadiusMessages.ko,
  ...adminDeliveryAdsStage3Messages.ko,
  ...adminConsoleCoreMessages.ko,
  ...copyAdminMessages.ko,
  ...copyAdminL25JsxAMessages.ko,
  ...copyAdminL25JsxBMessages.ko,
  ...copyAdminL25CommunityAMessages.ko,
  ...copyAdminL25CommunityBMessages.ko,
  ...copyAdminL25TradeMessages.ko,
  ...copyAdminL25MiscMessages.ko,
  ...copyAdminL25LibMessages.ko,
  ...copyAdminL25AdsMessages.ko,
  ...copyAdminL25OpsMessages.ko,
  ...copyAdminB4StoresMessages.ko,
  ...copyAdminB4AdsMessages.ko,
  ...copyAdminB4CommunityMessages.ko,
  ...copyAdminB4CoreMessages.ko,
  ...copyAdminB4OrdersMessages.ko,
  ...copyAdminB4FinanceMessages.ko,
  ...copyAdminB4Ops1Messages.ko,
  ...copyAdminB4Ops2Messages.ko,
} as Record<string, string>;

const ADMIN_EN = {
  ...adminMessages.en,
  ...adminOsLaunchMessages.en,
  ...adminFinanceSsot19Messages.en,
  ...adminLaunchIntroMessages.en,
  ...adminPlatformPromotionNotificationsMessages.en,
  ...adminDeployMessages.en,
  ...adminBoostPricesMessages.en,
  ...adminTradeSoldWindowMessages.en,
  ...adminLegalConsentMessages.en,
  ...adminPermissionsLabelsMessages.en,
  ...adminDeliveryOpsUxMessages.en,
  ...adminIaR1Messages.en,
  ...adminDashboardChatTabMessages.en,
  ...adminChatR1CMessages.en,
  ...adminChatR1BMessages.en,
  ...adminChatR1AMessages.en,
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
  ...homeHubAdminMessages.en,
  ...adminMemberIdV3Messages.en,
  ...adminStorePartnerAgreementsMessages.en,
  ...adminDeliveryLaunchMessages.en,
  ...adminMessengerContactsMessages.en,
  ...adminActionQueueMessages.en,
  ...adminMoimMessages.en,
  ...adminUsersAddressMessages.en,
  ...adminTradeRadiusMessages.en,
  ...adminDeliveryAdsStage3Messages.en,
  ...adminConsoleCoreMessages.en,
  ...copyAdminMessages.en,
  ...copyAdminL25JsxAMessages.en,
  ...copyAdminL25JsxBMessages.en,
  ...copyAdminL25CommunityAMessages.en,
  ...copyAdminL25CommunityBMessages.en,
  ...copyAdminL25TradeMessages.en,
  ...copyAdminL25MiscMessages.en,
  ...copyAdminL25LibMessages.en,
  ...copyAdminL25AdsMessages.en,
  ...copyAdminL25OpsMessages.en,
  ...copyAdminB4StoresMessages.en,
  ...copyAdminB4AdsMessages.en,
  ...copyAdminB4CommunityMessages.en,
  ...copyAdminB4CoreMessages.en,
  ...copyAdminB4OrdersMessages.en,
  ...copyAdminB4FinanceMessages.en,
  ...copyAdminB4Ops1Messages.en,
  ...copyAdminB4Ops2Messages.en,
} as Record<string, string>;

registerExtraMessages(ADMIN_KO, ADMIN_EN);

export const ADMIN_CATALOG_KEY_COUNT = Object.keys(ADMIN_KO).length;
