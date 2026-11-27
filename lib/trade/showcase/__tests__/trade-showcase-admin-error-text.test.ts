import { describe, expect, it } from "vitest";
import "@/lib/i18n/admin-catalog";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import {
  TRADE_SHOWCASE_ADMIN_SAVE_ERROR_KEYS,
  tradeShowcaseAdminSaveErrorText,
} from "@/lib/trade/showcase/trade-showcase-admin-error-text";

const tKo = (key: MessageKey, vars?: Record<string, string | number>) => translate("ko", key, vars);
const tEn = (key: MessageKey, vars?: Record<string, string | number>) => translate("en", key, vars);
const HANGUL = /[가-힣]/;

describe("tradeShowcaseAdminSaveErrorText (재감사 2026-11-27)", () => {
  it("every code maps to a ko·en key — en has no Hangul", () => {
    for (const code of Object.keys(TRADE_SHOWCASE_ADMIN_SAVE_ERROR_KEYS)) {
      const en = tradeShowcaseAdminSaveErrorText({ json: { ok: false, error: code }, status: 400 }, tEn);
      expect(en.trim().length).toBeGreaterThan(0);
      expect(HANGUL.test(en)).toBe(false);
      const ko = tradeShowcaseAdminSaveErrorText({ json: { ok: false, error: code }, status: 400 }, tKo);
      expect(ko).not.toBe(en);
    }
  });

  it("never shows a server sentence (DB message)", () => {
    const dbMessage = 'duplicate key value violates unique constraint "trade_showcase_items_pkey"';
    const en = tradeShowcaseAdminSaveErrorText({ json: { ok: false, error: dbMessage }, status: 400 }, tEn);
    expect(en).toBe(tEn("admin_trade_showcase_save_failed"));
    const ko = tradeShowcaseAdminSaveErrorText({ json: { ok: false, error: "저장 실패 문장" }, status: 400 }, tKo);
    expect(ko).toBe(tKo("admin_trade_showcase_save_failed"));
  });
});
