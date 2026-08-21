/**
 * 오너 guarded 서브라우트(basic-info 등) — compact scroll host + StoreBusinessGuard flex 체인.
 */
import { readFileSync } from "node:fs";

const errors = [];

const guard = readFileSync("components/business/StoreBusinessGuard.tsx", "utf8");
if (!guard.includes("OWNER_STORE_BUSINESS_GUARD_OK_SHELL_CLASS")) {
  errors.push("StoreBusinessGuard: must use OWNER_STORE_BUSINESS_GUARD_OK_SHELL_CLASS");
}
if (/return\s*<div className="min-h-screen">\{children\}<\/div>/.test(guard)) {
  errors.push("StoreBusinessGuard: min-h-screen on ok shell breaks owner scroll");
}

const shell = readFileSync("components/business/admin/BusinessAdminShell.tsx", "utf8");
if (!shell.includes("resolveOwnerStackScrollHostPath")) {
  errors.push("BusinessAdminShell: must use resolveOwnerStackScrollHostPath");
}
if (/ownerStackScrollHostPath[\s\S]{0,120}!isOwnerBasicInfoRoute/.test(shell)) {
  errors.push("BusinessAdminShell: must not exclude basic-info from scroll host path");
}
if (!/!isOwnerFormBottomNavHiddenRoute\s*\?/.test(shell)) {
  errors.push(
    "BusinessAdminShell: must still hide bottom nav on basic-info/profile/inquiries via !isOwnerFormBottomNavHiddenRoute"
  );
}

const scrollHost = readFileSync("lib/business/owner-stack-scroll-host-path.ts", "utf8");
if (!scrollHost.includes("basic-info")) {
  errors.push("owner-stack-scroll-host-path: document basic-info inclusion in comment or logic");
}

const layoutClient = readFileSync("app/(main)/stores/owner/StoresOwnerLayoutClient.tsx", "utf8");
if (!layoutClient.includes("OwnerHubRuntimeProvider")) {
  errors.push("StoresOwnerLayoutClient: must keep OwnerHubRuntimeProvider on hub+stack");
}
if (!layoutClient.includes("initialStores={initialStores}")) {
  errors.push("StoresOwnerLayoutClient: BusinessAdminShell must receive initialStores on hub+stack");
}
if (!layoutClient.includes("enforce={!isHub}")) {
  errors.push("StoresOwnerLayoutClient: StoreBusinessGuard must stay mounted with enforce={!isHub}");
}
if (/if \(isHub\) \{\s*return \(/.test(layoutClient) && layoutClient.includes("<StoreBusinessGuard>\n")) {
  errors.push("StoresOwnerLayoutClient: must not fork hub vs guarded into separate remount trees");
}

if (!guard.includes("enforce")) {
  errors.push("StoreBusinessGuard: must accept enforce prop for persistent owner shell");
}

const productsPage = readFileSync("app/(main)/stores/owner/products/page.tsx", "utf8");
if (productsPage.includes("MainFeedRouteLoading")) {
  errors.push("owner products page must not Suspense-fallback to MainFeedRouteLoading (pulse ban)");
}
if (!productsPage.includes("fallback={null}")) {
  errors.push("owner products page Suspense fallback must be null (cache-first shell)");
}

const settlementsPage = readFileSync("app/(main)/stores/owner/settlements/page.tsx", "utf8");
if (!settlementsPage.includes("OwnerAdminPageScrollShell")) {
  errors.push("owner settlements page must wrap view in OwnerAdminPageScrollShell");
}

const pointsPage = readFileSync("app/(main)/stores/owner/points/page.tsx", "utf8");
if (/padForOwnerBottomNav=\{false\}/.test(pointsPage)) {
  errors.push("owner points page must pad for bottom nav (do not set padForOwnerBottomNav={false})");
}

const ownerFormKeyboardHook = readFileSync("lib/business/use-owner-admin-form-keyboard.ts", "utf8");
if (!ownerFormKeyboardHook.includes("useFormKeyboardViewport")) {
  errors.push("useOwnerAdminFormKeyboard must reuse useFormKeyboardViewport");
}

for (const rel of [
  "components/business/BusinessApplyForm.tsx",
  "components/business/OwnerStoreProfileForm.tsx",
  "components/business/OwnerStoreBasicInfoForm.tsx",
  "components/business/owner/OwnerMenuCategoriesClient.tsx",
]) {
  const src = readFileSync(rel, "utf8");
  if (!src.includes("useOwnerAdminFormKeyboard")) {
    errors.push(`${rel}: must use useOwnerAdminFormKeyboard`);
  }
  if (src.includes("OWNER_STORE_ADMIN_FOOTER_FORM_PAD_CLASS")) {
    errors.push(`${rel}: must not use deprecated OWNER_STORE_ADMIN_FOOTER_FORM_PAD_CLASS`);
  }
}

const orderChats = readFileSync("components/business/owner/OwnerStoreOrderChatsView.tsx", "utf8");
if (!orderChats.includes("OWNER_COMPACT_SHELL_BODY_SCROLL_CLASS")) {
  errors.push("OwnerStoreOrderChatsView: must use OWNER_COMPACT_SHELL_BODY_SCROLL_CLASS scroll host");
}

const ordersBody = readFileSync("components/business/owner/OwnerStoreOrdersMobileBody.tsx", "utf8");
if (!ordersBody.includes("OWNER_COMPACT_SHELL_BODY_SCROLL_CLASS")) {
  errors.push("OwnerStoreOrdersMobileBody: must use OWNER_COMPACT_SHELL_BODY_SCROLL_CLASS scroll host");
}

const orderChatSurface = readFileSync("lib/chats/surfaces/order-chat-surface.ts", "utf8");
if (orderChatSurface.includes("/my/business/store-order-chat/")) {
  errors.push("storeOrderChatEnsureRedirectHref must not write /my/business/store-order-chat/");
}
if (!orderChatSurface.includes("/stores/owner/order-chat/")) {
  errors.push("storeOrderChatEnsureRedirectHref must use /stores/owner/order-chat/");
}

const ownerRoutes = readFileSync("lib/business/owner-routes.ts", "utf8");
if (!/menu:\s*\(storeId[\s\S]*?\/products/.test(ownerRoutes)) {
  errors.push("OwnerRoutes.menu must canonical to /products (no /menu tab hop)");
}

if (errors.length) {
  console.error("verify-owner-admin-scroll-shell-contract FAILED:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("verify-owner-admin-scroll-shell-contract OK");
