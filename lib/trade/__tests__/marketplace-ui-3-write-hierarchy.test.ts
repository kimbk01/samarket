import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function slotOrder(haystack: string, slots: string[]): number[] {
  return slots.map((slot) => haystack.indexOf(`data-ui3-slot="${slot}"`));
}

describe("marketplace UI-3 write visual hierarchy", () => {
  it("WriteSheetFlowInner does not block first viewport behind an empty ROOT card", () => {
    const inner = src("components/write/WriteSheetFlowInner.tsx");
    expect(inner).toContain('data-ui3-write-ungated="true"');
    expect(inner).toContain('data-ui3-write-root="true"');
    expect(inner).not.toMatch(
      /overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface">\s*<p className="py-10 text-center/
    );
    const ungated = inner.slice(inner.indexOf("data-ui3-write-ungated"));
    const [photos, title, price, item, description, submit] = slotOrder(ungated, [
      "photos",
      "title",
      "price",
      "item",
      "description",
      "submit",
    ]);
    expect(photos).toBeGreaterThan(-1);
    expect(photos).toBeLessThan(title);
    expect(title).toBeLessThan(price);
    expect(price).toBeLessThan(item);
    expect(item).toBeLessThan(description);
    expect(description).toBeLessThan(submit);
  });

  it("general/used-car/real-estate/rent-car shell keeps photo→title→price→item→description→location→submit", () => {
    const form = src("components/write/trade/TradeWriteForm.tsx");
    const general = form.slice(form.lastIndexOf('data-ui3-slot="photos"'));
    const [photos, title, price, item, description, location, submit] = slotOrder(general, [
      "photos",
      "title",
      "price",
      "item",
      "description",
      "location",
      "submit",
    ]);
    expect(photos).toBeGreaterThan(-1);
    expect(photos).toBeLessThan(title);
    expect(title).toBeLessThan(price);
    expect(price).toBeLessThan(item);
    expect(item).toBeLessThan(description);
    expect(description).toBeLessThan(location);
    expect(location).toBeLessThan(submit);
    expect(general.indexOf('data-ui3-slot="call-policy"')).toBeGreaterThan(location);
  });

  it("jobs price writer stays pay_amount/pay_type and sits before 품목정보", () => {
    const jobs = src("components/write/trade/generic/JobsExtendedWriteFields.tsx");
    expect(jobs.indexOf('data-ui3-slot="price"')).toBeLessThan(jobs.indexOf("{itemInfoHeader}"));
    expect(jobs).toContain('f.id === "pay_amount"');
    expect(jobs).toContain('f.id === "pay_type"');
    expect(jobs).not.toContain("posts.price");
  });

  it("exchange amount writer stays PHP amount and sits in the price slot", () => {
    const exchange = src("components/write/trade/generic/ExchangeExtendedWriteFields.tsx");
    const title = exchange.indexOf('data-ui3-slot="title"');
    const price = exchange.indexOf('data-ui3-slot="price"');
    expect(title).toBeGreaterThan(-1);
    expect(title).toBeLessThan(price);
    expect(price).toBeLessThan(exchange.indexOf("{itemInfoHeader}"));
    expect(exchange).toContain("exchange_write_amount_php");
    expect(exchange).toContain("price: amountValue");
  });

  it("rent-car price slot uses daily_price writer, not a new posts.price field", () => {
    const form = src("components/write/trade/TradeWriteForm.tsx");
    expect(form).toContain('rentCarAdaptedFields.filter((f) => f.id === "daily_price")');
    expect(form).toContain('"daily_price"');
  });

  it("real-estate price slot uses existing price/deposit/monthly writers", () => {
    const form = src("components/write/trade/TradeWriteForm.tsx");
    expect(form).toContain('f.id === "price" || f.id === "deposit" || f.id === "monthly"');
    expect(form).toContain('skipFieldIds={["price", "deposit", "monthly"]}');
  });

  it("does not add a new write form entry besides TradeCategoryWriteForm", () => {
    const entry = src("components/write/trade/TradeCategoryWriteForm.tsx");
    expect(entry).toContain("TradeWriteForm");
    expect(entry).not.toMatch(/JobsWriteForm|ExchangeWriteForm/);
  });
});
