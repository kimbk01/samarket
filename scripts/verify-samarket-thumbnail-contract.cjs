const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function fail(message) {
  console.error(`[thumbnail-contract] ${message}`);
  process.exitCode = 1;
}

function assertIncludes(source, needle, rel, message) {
  if (!source.includes(needle)) fail(`${rel}: ${message}`);
}

const commonRel = "components/common/SamarketThumbnail.tsx";
const common = read(commonRel);

assertIncludes(common, "<img", commonRel, "native img must remain the only image primitive");
assertIncludes(common, "objectFit: \"cover\"", commonRel, "must force object-fit: cover inline");
assertIncludes(common, "objectPosition: \"center center\"", commonRel, "must force center crop inline");
assertIncludes(common, "!h-full !w-full", commonRel, "must override height:auto preflight regressions");
assertIncludes(common, "animate-pulse", commonRel, "must keep loading skeleton");
assertIncludes(common, "fallbackSrc", commonRel, "must keep fallback image path");

if (/from\s+["']next\/image["']/.test(common) || /<Image\b/.test(common)) {
  fail(`${commonRel}: next/image is forbidden for the shared thumbnail contract`);
}
if (/object-contain/.test(common) || /scale-\[/.test(common)) {
  fail(`${commonRel}: contain or arbitrary scale is forbidden inside the shared thumbnail primitive`);
}

const thumbnailFiles = [
  "components/stores/common/StoreProductThumbnail.tsx",
  "components/stores/cart/baemin/StoreBaeminCartLineRow.tsx",
  "components/stores/cart/baemin/StoreBaeminCartUpsellSection.tsx",
  "components/stores/cart/baemin/StoreBaeminCartStoreBlock.tsx",
  "components/stores/detail/ProductMenuCard.tsx",
  "components/stores/detail/RecommendedMenuSection.tsx",
  "components/stores/detail/PopularMenuSection.tsx",
  "components/stores/StorePublicMenuList.tsx",
  "components/stores/StoreMenuBoardPreamble.tsx",
  "components/stores/StoreProductAddSheet.tsx",
  "components/stores/store-order-detail/StoreCartPreviewLineRow.tsx",
  "components/stores/home/StoreDeliveryRowCard.tsx",
  "components/stores/home/StoreVerticalDiscoveryCard.tsx",
  "components/stores/home/StoreHorizontalStoreTile.tsx",
  "components/stores/StoreCommerceOrderDetailClient.tsx",
  "components/stores/StoreMenuReviewFlowLink.tsx",
  "components/stores/StoreDetailStickyTopRow.tsx",
  "components/delivery/search/DeliverySearchResults.tsx",
  "components/product/ProductCard.tsx",
  "components/product/form/ProductImagePicker.tsx",
  "components/favorites/FavoriteProductCard.tsx",
  "components/chats/ChatRoomCard.tsx",
  "components/chats/GeneralChatRoomCard.tsx",
  "components/chats/ChatDetailView.tsx",
  "components/chats/ChatProductSummary.tsx",
  "components/chats/TradeChatComposePreparingShell.tsx",
  "components/community-messenger/MessengerChatListItem.tsx",
  "components/community-messenger/MessengerLineFriendRow.tsx",
  "components/community-messenger/MessengerFriendsMyProfileStrip.tsx",
  "components/community-messenger/MessengerFriendProfileSheet.tsx",
  "components/community-messenger/MessengerFriendAddSheet.tsx",
  "components/community-messenger/MessengerFriendsPrivacySheet.tsx",
  "components/community-messenger/trade-chat-list/TradeProductThumb.tsx",
  "components/community-messenger/room/phase2/ChatRoomMoreMenu.tsx",
  "components/community-messenger/room/phase2/MessengerTradeProductDockRow.tsx",
  "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx",
  "components/community-messenger/room/phase2/MessengerTimelineVirtualRow.tsx",
  "components/post/PostCard.tsx",
  "components/post/PostDetailRelatedSections.tsx",
  "components/post/PostDetailView.tsx",
  "components/offers/MyOffersView.tsx",
  "components/community/feed-list-layouts.tsx",
  "components/community/post-detail/CommunityCommentComposerForm.tsx",
  "components/community/post-detail/CommunitySimilarPostsSection.tsx",
  "components/community/post-detail/CommunityInlineAdCard.tsx",
  "components/messenger/call/CallAvatar.tsx",
  "components/messenger/call/ConnectedVideoView.tsx",
  "components/mypage/products/MyProductCard.tsx",
  "components/mypage/MyStoreOrdersView.tsx",
  "components/mypage/StoreOrderReviewForm.tsx",
  "components/mypage/purchases/PurchaseDetailView.tsx",
  "components/mypage/purchases/PurchaseHistoryCard.tsx",
  "components/mypage/purchases/PurchaseReviewSheet.tsx",
  "components/mypage/sales/SalesHistoryCard.tsx",
  "components/mypage/reviews/MyWrittenReviewsView.tsx",
  "components/mypage/reviews/TradeReviewsManagementView.tsx",
];

for (const rel of thumbnailFiles) {
  const source = read(rel);
  if (!/SamarketThumbnail|StoreProductThumbnail/.test(source)) {
    fail(`${rel}: must render thumbnails through the shared thumbnail component`);
  }
  if (/from\s+["']next\/image["']|<Image\b|DeliveryMediaImage|<img\b/.test(source)) {
    fail(`${rel}: direct image primitives are forbidden in thumbnail surfaces`);
  }
  if (/object-contain|height:\s*["']auto["']/.test(source)) {
    fail(`${rel}: contain or height:auto thumbnail regression detected`);
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log("[thumbnail-contract] ok");
