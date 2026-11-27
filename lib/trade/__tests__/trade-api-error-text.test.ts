import { describe, expect, it } from "vitest";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import {
  BULK_REGION_ERROR_KEYS,
  JOB_APPLY_ERROR_KEYS,
  POST_COMMENT_ERROR_KEYS,
  TRADE_CHAT_ENTRY_ERROR_KEYS,
  TRADE_CHAT_SEND_ERROR_KEYS,
  TRADE_LISTING_ERROR_KEYS,
  TRADE_LISTING_WARNING_KEYS,
  TRADE_WRITE_ERROR_KEYS,
  tradeChatEntryErrorText,
  tradeChatPhotoPreviewToken,
  tradeChatSendErrorText,
  tradeChatStoredPreviewText,
  tradeListingWarningText,
  tradeStoredListingLabelText,
  tradeWriteErrorText,
  TRADE_CHAT_PREVIEW_TOKEN_MESSAGE,
  TRADE_CHAT_PREVIEW_TOKEN_STATUS_NOTICE,
  TRADE_CHAT_PREVIEW_TOKEN_SYSTEM,
} from "@/lib/trade/trade-api-error-text";
import { SELLER_LISTING_LABEL, publicListingBadgeKey } from "@/lib/products/seller-listing-state";
import { geolocationFailMessageKey } from "@/lib/map/geolocation";

const tKo = (key: MessageKey, vars?: Record<string, string | number>) => translate("ko", key, vars);
const tEn = (key: MessageKey, vars?: Record<string, string | number>) => translate("en", key, vars);
const HANGUL = /[가-힣]/;
const CODE_SHAPE = /^[a-z][a-z0-9_]*$/;

const ALL_MAPS = {
  TRADE_CHAT_SEND_ERROR_KEYS,
  TRADE_CHAT_ENTRY_ERROR_KEYS,
  TRADE_LISTING_ERROR_KEYS,
  TRADE_WRITE_ERROR_KEYS,
  POST_COMMENT_ERROR_KEYS,
  JOB_APPLY_ERROR_KEYS,
  BULK_REGION_ERROR_KEYS,
  TRADE_LISTING_WARNING_KEYS,
};

describe("거래 API 오류 코드 → 키 (재감사 2026-11-27)", () => {
  for (const [name, map] of Object.entries(ALL_MAPS)) {
    it(`${name}: 영어 결과에 한글 0 · 한국어 결과에 코드·빈 값 0`, () => {
      for (const [code, key] of Object.entries(map)) {
        expect(CODE_SHAPE.test(code), code).toBe(true);
        const en = tEn(key, { until: "2026-12-01 10:00" });
        const ko = tKo(key, { until: "2026-12-01 10:00" });
        expect(HANGUL.test(en), `${code} en=${en}`).toBe(false);
        expect(en.trim().length, code).toBeGreaterThan(0);
        expect(ko, code).not.toBe(key);
        expect(ko, code).not.toBe(code);
        expect(HANGUL.test(ko), `${code} ko=${ko}`).toBe(true);
      }
    });
  }

  it("서버 문장(코드 아님)은 화면에 나오지 않는다", () => {
    const en = tradeChatSendErrorText(
      { json: { ok: false, error: "채팅방을 찾을 수 없습니다." }, status: 400 },
      tEn
    );
    expect(en).toBe(tEn("nav_trade_cannot_send_message"));
    const entry = tradeChatEntryErrorText({ json: { error: "insert or update violates foreign key" } }, tEn);
    expect(entry).toBe(tEn("chats_compose_create_failed"));
  });

  it("거래 제한 — 끝 시각은 params 로 받아 키에 넣는다", () => {
    const en = tradeWriteErrorText(
      {
        json: {
          ok: false,
          error: "trade_restricted_until",
          code: "trade_restricted_until",
          params: { until: "2026-12-01 10:00" },
        },
        status: 403,
      },
      tEn
    );
    expect(en).toContain("2026-12-01 10:00");
    expect(HANGUL.test(en)).toBe(false);
    expect(tradeWriteErrorText({ code: "trade_restricted", status: 403 }, tKo)).toBe(tKo("reaudit_trade_restricted"));
  });

  it("판매 단계 경고 코드 → 문구, 모르는 경고는 숨김", () => {
    expect(tradeListingWarningText("seller_listing_column_missing", tEn)).toBe(
      tEn("reaudit_trade_listing_warn_stage_partial")
    );
    expect(tradeListingWarningText("판매 단계 전용 컬럼이 없어", tEn)).toBeNull();
  });
});

describe("거래 채팅 저장 토큰 → 화면 문구 (옛·새 행 공통)", () => {
  it("사진·사진 N장·거래 상태 안내·(시스템)·(메시지)", () => {
    expect(tradeChatStoredPreviewText(tradeChatPhotoPreviewToken(1), tEn)).toBe(tEn("cm_home_preview_photo"));
    expect(tradeChatStoredPreviewText(tradeChatPhotoPreviewToken(3), tEn)).toBe(
      tEn("cm_ui_photo_count_sheets", { count: 3 })
    );
    expect(tradeChatStoredPreviewText(TRADE_CHAT_PREVIEW_TOKEN_STATUS_NOTICE, tEn)).toBe(
      tEn("reaudit_trade_chat_preview_status_notice")
    );
    for (const token of [
      tradeChatPhotoPreviewToken(1),
      tradeChatPhotoPreviewToken(5),
      TRADE_CHAT_PREVIEW_TOKEN_STATUS_NOTICE,
      TRADE_CHAT_PREVIEW_TOKEN_SYSTEM,
      TRADE_CHAT_PREVIEW_TOKEN_MESSAGE,
    ]) {
      expect(HANGUL.test(token), token).toBe(true);
      expect(HANGUL.test(tradeChatStoredPreviewText(token, tEn)), token).toBe(false);
    }
    // 옛 행(같은 고정 문장)도 같은 결과
    expect(tradeChatStoredPreviewText(tradeChatPhotoPreviewToken(2), tKo)).toBe(tKo("cm_ui_photo_count_sheets", { count: 2 }));
  });

  it("회원이 쓴 메시지는 그대로", () => {
    expect(tradeChatStoredPreviewText("사진 보내주세요", tEn)).toBe("사진 보내주세요");
    expect(tradeChatStoredPreviewText("hello", tKo)).toBe("hello");
  });

  it("저장된 글 상태 토큰 → 언어별 문구", () => {
    for (const label of [...Object.values(SELLER_LISTING_LABEL), "숨김", "삭제됨"]) {
      const en = tradeStoredListingLabelText(label, tEn);
      expect(HANGUL.test(en), label).toBe(false);
    }
    expect(tradeStoredListingLabelText("모르는 값", tEn)).toBe("모르는 값");
  });
});

describe("라벨 키 함수", () => {
  it("publicListingBadgeKey — 영어 결과 한글 0", () => {
    const cases: Array<[Parameters<typeof publicListingBadgeKey>[0], string]> = [
      ["inquiry", "active"],
      ["negotiating", "active"],
      ["reserved", "active"],
      ["completed", "active"],
      [undefined, "hidden"],
      [undefined, "deleted"],
      [undefined, "sold"],
    ];
    for (const [ls, st] of cases) {
      const { key } = publicListingBadgeKey(ls, st);
      expect(HANGUL.test(tEn(key)), `${ls}/${st}`).toBe(false);
      expect(HANGUL.test(tKo(key)), `${ls}/${st}`).toBe(true);
    }
  });

  it("위치 실패 이유 → 키 (en 한글 0)", () => {
    for (const reason of ["denied", "unavailable", "timeout", "unsupported"] as const) {
      expect(HANGUL.test(tEn(geolocationFailMessageKey(reason)))).toBe(false);
      expect(HANGUL.test(tKo(geolocationFailMessageKey(reason)))).toBe(true);
    }
  });
});
