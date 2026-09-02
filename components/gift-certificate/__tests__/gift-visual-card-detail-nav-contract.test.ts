import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(
  join(process.cwd(), "components/gift-certificate/GiftVisualCard.tsx"),
  "utf8",
);

describe("GiftVisualCard wallet detail navigation contract", () => {
  it("does not suppress detail/send actions when footer is present", () => {
    expect(src).toContain("data-gift-card-actions");
    expect(src).toContain("data-gift-card-footer");
    // footer and actions are independent branches (not footer ? … : actions)
    expect(src).not.toMatch(
      /footer \? \([\s\S]*?\) : detailBtn \|\| sendBtn \?/,
    );
  });

  it("wallet owned rows pass detailHref alongside purchase footer", () => {
    const wallet = readFileSync(
      join(process.cwd(), "components/orders/customer-commerce/CustomerGiftWalletBody.tsx"),
      "utf8",
    );
    expect(wallet).toContain("detailHref={ownedGiftInstanceHref(row.id");
    expect(wallet).toContain("WalletPurchaseSecondary");
  });
});
