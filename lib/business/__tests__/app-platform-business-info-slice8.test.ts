import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  pickPublishedBusinessInfo,
  type AppPlatformBusinessInfoRow,
} from "@/lib/business/app-platform-business-info";

const root = path.resolve(__dirname, "../../..");

function row(partial: Partial<AppPlatformBusinessInfoRow> & { id: string }): AppPlatformBusinessInfoRow {
  return {
    locale: "ko",
    companyName: "c",
    representativeName: "",
    registrationNumber: "",
    mailOrderNumber: "",
    address: "",
    email: "",
    phone: "",
    version: "1",
    status: "published",
    publishedAt: "2026-08-01T00:00:00Z",
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    ...partial,
  };
}

describe("Slice8 Business CMS Phase 2", () => {
  it("picks newest published business info", () => {
    const picked = pickPublishedBusinessInfo([
      row({ id: "old", publishedAt: "2026-01-01T00:00:00Z" }),
      row({ id: "new", publishedAt: "2026-08-01T00:00:00Z" }),
      row({ id: "draft", status: "draft", publishedAt: null }),
    ]);
    expect(picked?.id).toBe("new");
  });

  it("keeps business CMS separate from legal and notices", () => {
    const pub = readFileSync(path.join(root, "app/api/business-info/route.ts"), "utf8");
    const admin = readFileSync(path.join(root, "app/api/admin/app-business-info/route.ts"), "utf8");
    const legal = readFileSync(path.join(root, "app/api/legal/[kind]/route.ts"), "utf8");
    expect(pub).toContain("app_platform_business_info");
    expect(pub).not.toContain("requireAdminApiUser");
    expect(admin).toContain("requireAdminApiUser");
    expect(legal).not.toContain("app_platform_business_info");
    expect(legal).toContain("app_legal_documents");
  });

  it("mypage support menu links to /business-info", () => {
    const menu = readFileSync(path.join(root, "lib/mypage/mypage-home-menu-config.ts"), "utf8");
    expect(menu).toContain('href: "/business-info"');
    expect(menu).toContain("mypage_comp_menu_support_business_title");
  });
});
