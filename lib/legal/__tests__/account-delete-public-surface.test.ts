import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");

describe("account delete public surface", () => {
  it("exposes guest /account/delete and allowlists it", () => {
    const page = readFileSync(path.join(root, "app/account/delete/page.tsx"), "utf8");
    const client = readFileSync(path.join(root, "app/account/delete/AccountDeletePublicPageClient.tsx"), "utf8");
    const guest = readFileSync(path.join(root, "lib/auth/guest-browse-access-policy.ts"), "utf8");
    const signup = readFileSync(path.join(root, "lib/auth/dibay-signup-status.ts"), "utf8");
    expect(page).toContain("AccountDeletePublicPageClient");
    expect(client).toContain("support@dibay.app");
    expect(client).toContain("MYPAGE_HOME_ACCOUNT_LEAVE_HREF");
    expect(guest).toContain('pathname === "/account/delete"');
    expect(signup).toContain('p === "/account/delete"');
  });
});
