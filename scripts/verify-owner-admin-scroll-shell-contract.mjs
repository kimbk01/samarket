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

if (errors.length) {
  console.error("verify-owner-admin-scroll-shell-contract FAILED:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("verify-owner-admin-scroll-shell-contract OK");
