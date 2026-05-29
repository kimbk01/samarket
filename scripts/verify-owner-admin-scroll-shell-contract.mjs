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

if (errors.length) {
  console.error("verify-owner-admin-scroll-shell-contract FAILED:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("verify-owner-admin-scroll-shell-contract OK");
