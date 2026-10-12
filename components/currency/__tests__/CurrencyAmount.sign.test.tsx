import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CurrencyAmount, currencyAmountSignPrefix } from "@/components/currency/CurrencyAmount";

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({ language: "en" }),
}));

const MINUS = "−";

function text(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

describe("CurrencyAmount sign prefix (T4)", () => {
  it.each([
    [-100, false, MINUS],
    [-100, true, MINUS],
    [100, false, ""],
    [100, true, "+"],
    [0, false, ""],
    [0, true, ""],
  ])("amount %d signed=%s → prefix %j", (amount, signed, expected) => {
    expect(currencyAmountSignPrefix(amount, signed)).toBe(expected);
  });

  it("negative always renders the minus sign, even when unsigned", () => {
    const unsigned = text(renderToStaticMarkup(<CurrencyAmount currency="coin" amount={-100} />));
    const signed = text(renderToStaticMarkup(<CurrencyAmount currency="coin" amount={-100} signed />));
    expect(unsigned.startsWith(MINUS)).toBe(true);
    expect(signed.startsWith(MINUS)).toBe(true);
    expect(unsigned).not.toContain("+");
  });

  it("positive renders + only when signed", () => {
    const unsigned = text(renderToStaticMarkup(<CurrencyAmount currency="coin" amount={100} />));
    const signed = text(renderToStaticMarkup(<CurrencyAmount currency="coin" amount={100} signed />));
    expect(unsigned.startsWith("+")).toBe(false);
    expect(unsigned.startsWith(MINUS)).toBe(false);
    expect(signed.startsWith("+")).toBe(true);
  });

  it("zero renders no prefix", () => {
    for (const signed of [false, true]) {
      const t = text(renderToStaticMarkup(<CurrencyAmount currency="cash" amount={0} isMinor signed={signed} />));
      expect(t.startsWith("+")).toBe(false);
      expect(t.startsWith(MINUS)).toBe(false);
    }
  });
});
