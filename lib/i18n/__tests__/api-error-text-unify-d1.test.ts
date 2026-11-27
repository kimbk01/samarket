/**
 * 사후 검토 D1·D2·E2·E3·M6 (2026-11-27 · `docs/audit/i18n-postmerge-fix-design-2026-11-27.md` §2·§4 「D1 표 통합 전·후 문구 동일」).
 *
 * 표 통합 전 결과(fixture — 통합 전 코드로 뽑음)와 지금 결과를 **모든 함수 × 모든 코드**로 비교한다.
 * 같은 코드 → 같은 결과. 달라져도 되는 것은 아래 4가지뿐이고, 각각 이유를 적은 규칙으로만 허용한다.
 *  1. D2 — 같은 뜻 4건(`reserved_not_supported`·`phone_verification_required`·`supabase_unconfigured`·`invalid_json`)은 키 하나.
 *  2. D1 공통 단계 — 도메인 표에 없던 코드가 공통 표(`COMMON_API_ERROR_CODE_MAP`)에 있으면 이제 공통 문구(전에는 화면 기본 문구).
 *  3. D1 사장님 두 경로 통합 — 옛 `resolveOwnerApiErrorMessage` 는 옛 추가 표 코드도 이제 구체 문구(전에는 「처리 실패」).
 *  4. E2·E3·M6 — 「저장 실패」로만 나오던 코드에 구체 문구를 붙임(설계 결함 수정).
 * D3 로 지운 중복 키(ko·en 이 기존 키와 같음)는 기존 키로 바꿔 비교한다 — 화면 글자는 같다(아래 D3 테스트가 확인).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { MessageKey } from "@/lib/i18n/messages";
import { translate } from "@/lib/i18n/messages";
import { resolveApiErrorText, isApiErrorCode, type ApiErrorTranslate } from "@/lib/i18n/api-error-text";
import { COMMON_API_ERROR_CODE_MAP } from "@/lib/http/common-api-error-code-map";
import * as trade from "@/lib/trade/trade-api-error-text";
import * as community from "@/lib/community/community-api-error-text";
import * as report from "@/lib/reports/report-block-error-text";
import { resolveRiderApiErrorText } from "@/lib/rider/rider-api-error-text";
import { GROUP_CHAT_API_ERROR_CODE_MAP } from "@/lib/group-chat/group-chat-error-text";
import { resolveOwnerPostApiErrorText } from "@/lib/posts/owner-post-api-error-text";
import { postImageUploadErrorText } from "@/lib/posts/post-image-upload-error-text";
import {
  OWNER_API_ERROR_MAP,
  resolveOwnerApiErrorMessage,
  resolveOwnerApiErrorText,
} from "@/lib/business/owner-api-error-text";
import { resolveOwnerProductRegisterError } from "@/lib/business/owner-product-register-error";
/** 통합 전 결과(JSON) — tsconfig.test 는 JSON import 를 포함하지 않으므로 파일로 읽는다 */
const fixture = JSON.parse(
  readFileSync(path.join(__dirname, "fixtures/api-error-text-before-2026-11-27.json"), "utf8")
);

const t = ((key: MessageKey) => key) as ApiErrorTranslate;
const FB: MessageKey = "common_error";

type Before = { fallback: string; resolved: Record<string, string> };
const BEFORE = fixture.before as Record<string, Before>;
const CODES = fixture.codes as string[];

const RESOLVERS: Record<string, (code: string) => string> = {
  tradeSend: (c) => trade.tradeChatSendErrorText({ code: c }, t),
  tradeEntry: (c) => trade.tradeChatEntryErrorText({ code: c }, t),
  tradeListing: (c) => trade.tradeListingErrorText({ code: c }, t),
  tradeWrite: (c) => trade.tradeWriteErrorText({ code: c }, t),
  postComment: (c) => trade.postCommentErrorText({ code: c }, t),
  jobApply: (c) => trade.jobApplyErrorText({ code: c }, t),
  bulkRegion: (c) => trade.bulkRegionErrorText({ code: c }, t),
  cOg: (c) => community.communityApiErrorText({ code: c }, community.COMMUNITY_OG_IMAGE_ERROR_KEYS, FB, t),
  cWrite: (c) => community.communityApiErrorText({ code: c }, community.COMMUNITY_POST_WRITE_ERROR_KEYS, FB, t),
  cDelete: (c) => community.communityApiErrorText({ code: c }, community.COMMUNITY_POST_DELETE_ERROR_KEYS, FB, t),
  cComment: (c) => community.communityApiErrorText({ code: c }, community.COMMUNITY_COMMENT_ERROR_KEYS, FB, t),
  cFeed: (c) => community.communityApiErrorText({ code: c }, community.COMMUNITY_FEED_ERROR_KEYS, FB, t),
  report: (c) => report.reportErrorText({ code: c, status: null }, t),
  block: (c) => report.userBlockErrorText({ code: c, status: null }, t),
  rider: (c) => resolveRiderApiErrorText(c, t),
  group: (c) => resolveApiErrorText({ code: c, map: GROUP_CHAT_API_ERROR_CODE_MAP, fallbackKey: FB, t }),
  ownerPost: (c) => resolveOwnerPostApiErrorText({ code: c, fallbackKey: FB, t }),
  postImg: (c) => postImageUploadErrorText({ code: c }, t),
  ownerText: (c) => resolveOwnerApiErrorText(c, t, FB),
  ownerMessage: (c) => resolveOwnerApiErrorMessage(c, t),
  productRegister: (c) => resolveOwnerProductRegisterError({ error: c }, "edit", t).description,
};

/** 1. D2 — 같은 코드 → 같은 키 */
const D2_KEYS: Readonly<Record<string, MessageKey>> = {
  reserved_not_supported: "reaudit_trade_listing_err_reserved_not_supported",
  phone_verification_required: "owner_post_err_phone_verification_required",
  supabase_unconfigured: "net_dibay_error",
  invalid_json: "reaudit_trade_err_invalid_request",
};

/** 4. E2·E3·M6 — 새로 구체 문구가 붙은 코드 → 함수별 키 */
const NEW_SPECIFIC: Readonly<Record<string, Readonly<Record<string, MessageKey>>>> = {
  /** E2 사장님 상품 */
  owner: {
    title_required: "business_phase7_354",
    invalid_price: "business_phase7_356",
    invalid_category_id: "business_phase7_365",
    title_too_long: "store_owner_prd_title_too_long",
    summary_too_long: "store_owner_prd_summary_too_long",
    price_too_large: "store_owner_prd_price_too_large",
    stock_too_large: "store_owner_prd_stock_too_large",
    invalid_stock: "owner_product_err_invalid_stock",
    invalid_discount_percent: "owner_product_err_invalid_discount_percent",
    invalid_discount_for_price: "owner_product_err_discount_for_price",
    price_required_for_discount_percent: "owner_product_err_price_required_for_discount",
    invalid_item_type: "owner_product_err_invalid_item_type",
  },
  /** E3 필라이프 글쓰기 */
  cWrite: {
    image_not_allowed: "philife_write_err_image_not_ready",
    too_many_images: "philife_write_err_image_limit",
  },
  /** M6 거래 글쓰기 */
  tradeWrite: { required_field_missing: "trade_write_err_required_fields" },
};

/** D3 — 지운 새 키 → 같은 글자의 기존 키 */
const D3_REPLACED: Readonly<Record<string, MessageKey>> = {
  reaudit_trade_write_err_profile_incomplete: "api_err_profile_incomplete",
  reaudit_trade_job_err_post_not_found: "community_err_post_not_found",
  reaudit_trade_bulk_region_err_location_required: "settings_bulk_region_location_required",
  community_comment_err_profile_incomplete: "api_err_profile_incomplete",
  ui_group_chat_input_placeholder: "nav_messenger_input_placeholder",
};
/** D3 로 지운 키의 통합 전 글자 (ko·en) — 바꾼 기존 키와 같아야 한다 */
const D3_REMOVED_TEXT: Readonly<Record<string, { ko: string; en: string }>> = {
  reaudit_trade_write_err_profile_incomplete: { ko: "프로필 정보를 먼저 완성해 주세요.", en: "Please complete your profile first." },
  reaudit_trade_job_err_post_not_found: { ko: "글을 찾을 수 없습니다.", en: "Post not found." },
  reaudit_trade_bulk_region_err_location_required: {
    ko: "대표·거래·생활 기본 주소 또는 프로필 지역을 먼저 설정해 주세요.",
    en: "Set your main address or profile area first.",
  },
  community_comment_err_profile_incomplete: {
    ko: "프로필 정보를 먼저 완성해 주세요.",
    en: "Please complete your profile first.",
  },
  ui_group_chat_input_placeholder: { ko: "메시지를 입력하세요", en: "Type a message" },
};

const OWNER_RESOLVERS = new Set(["ownerText", "ownerMessage", "productRegister"]);

function expectedNow(resolver: string, code: string): { key: string; reason: string } {
  const before = BEFORE[resolver]!;
  const rawPrev = before.resolved[code] ?? before.fallback;
  const prev = D3_REPLACED[rawPrev] ?? rawPrev;
  const mappedBefore = Object.prototype.hasOwnProperty.call(before.resolved, code);
  const specific = NEW_SPECIFIC[OWNER_RESOLVERS.has(resolver) ? "owner" : resolver]?.[code];
  if (specific && !mappedBefore) return { key: specific, reason: "E2·E3·M6 구체 문구" };
  if (code in D2_KEYS && (mappedBefore || code in COMMON_API_ERROR_CODE_MAP)) {
    // 옵션 코드 갈래(상품 등록 창)는 공통 단계보다 먼저라 D2 와 무관
    return { key: D2_KEYS[code]!, reason: "D2 같은 코드 같은 키" };
  }
  if (!mappedBefore && code in COMMON_API_ERROR_CODE_MAP) {
    return { key: COMMON_API_ERROR_CODE_MAP[code]!, reason: "D1 공통 단계" };
  }
  if (resolver === "ownerMessage" && !mappedBefore && code in OWNER_API_ERROR_MAP) {
    return { key: OWNER_API_ERROR_MAP[code]!, reason: "D1 사장님 두 경로 통합" };
  }
  return { key: prev, reason: "같음" };
}


describe("D1 — 오류 문구 표 통합 전·후 결과 비교 (함수 × 코드 전수)", () => {
  it("fixture 가 모든 함수를 담는다", () => {
    expect(Object.keys(RESOLVERS).sort()).toEqual(Object.keys(BEFORE).sort());
    expect(CODES.length).toBeGreaterThan(200);
  });

  for (const resolver of Object.keys(RESOLVERS)) {
    it(`${resolver}: 같은 코드 → 같은 결과 (허용된 변경만 다름)`, () => {
      const diffs: string[] = [];
      for (const code of CODES) {
        const now = RESOLVERS[resolver]!(code);
        const exp = expectedNow(resolver, code);
        if (now !== exp.key) diffs.push(`${code}: now=${now} expected=${exp.key} (${exp.reason})`);
      }
      expect(diffs).toEqual([]);
    });
  }

  it("허용된 변경 목록 — D2 는 4건만", () => {
    const d2Changed = new Set<string>();
    for (const resolver of Object.keys(RESOLVERS)) {
      for (const code of CODES) {
        const exp = expectedNow(resolver, code);
        const before = BEFORE[resolver]!;
        const prev = before.resolved[code] ?? before.fallback;
        if (exp.reason.startsWith("D2") && exp.key !== prev) d2Changed.add(code);
      }
    }
    expect([...d2Changed].sort()).toEqual(Object.keys(D2_KEYS).sort());
  });
});

describe("D3 — 지운 중복 키는 기존 키와 글자가 같다", () => {
  it("ko·en 동일", () => {
    for (const [removed, kept] of Object.entries(D3_REPLACED)) {
      expect(translate("ko", kept), removed).toBe(D3_REMOVED_TEXT[removed]!.ko);
      expect(translate("en", kept), removed).toBe(D3_REMOVED_TEXT[removed]!.en);
    }
  });
});

describe("D1 — 코드 모양 검사 하나", () => {
  it("isApiErrorCode", () => {
    expect(isApiErrorCode("title_too_long")).toBe(true);
    expect(isApiErrorCode(" title_too_long ")).toBe(true);
    expect(isApiErrorCode("상품명은 120자 이하")).toBe(false);
    expect(isApiErrorCode("Title")).toBe(false);
    expect(isApiErrorCode("")).toBe(false);
    expect(isApiErrorCode(null)).toBe(false);
    expect(isApiErrorCode(42)).toBe(false);
  });
});

describe("E2 — 사장님 상품 오류는 구체 문구 + 서버 params", () => {
  const tr = (lang: "ko" | "en"): ApiErrorTranslate => (key, vars) => translate(lang, key, vars);

  it("한도 숫자는 params.max 로 그린다 (서버 message 는 쓰지 않음)", () => {
    const json = { ok: false, error: "price_too_large", message: "판매가는 10,000,000 이하로 입력해 주세요.", params: { max: "10,000,000" } };
    expect(resolveOwnerProductRegisterError(json, "new", tr("en")).description).toBe("Price must be at most 10,000,000.");
    expect(resolveOwnerProductRegisterError(json, "new", tr("ko")).description).toBe("판매가는 10,000,000 이하로 입력해 주세요.");
    const title = { error: "title_too_long", message: "Item name must be at most 120 characters.", params: { max: 120 } };
    expect(resolveOwnerProductRegisterError(title, "edit", tr("ko")).description).toBe("상품명은 120자 이하로 입력해 주세요.");
  });

  it("중복 옵션 그룹·선택지는 params 로 구체 문구, params 없으면 일반 옵션 문구", () => {
    expect(
      resolveOwnerProductRegisterError(
        { error: "duplicate_option_name", params: { groupIndex: 2, name: "Large" } },
        "edit",
        tr("en")
      ).description
    ).toBe("Option group 2: Choice “Large” is duplicated. Use a different name.");
    expect(
      resolveOwnerProductRegisterError({ error: "duplicate_option_group_id", params: { groupIndex: 1 } }, "edit", tr("ko"))
        .description
    ).toBe(translate("ko", "store_owner_opt_duplicate_group_id", { group: translate("ko", "store_owner_opt_group_label", { index: 1 }) }));
    expect(resolveOwnerProductRegisterError({ error: "duplicate_option_name" }, "edit", tr("en")).description).toBe(
      translate("en", "store_owner_opt_invalid_json")
    );
  });

  it("「저장 실패」로만 나오던 12종이 이제 저장 실패 문구가 아니다", () => {
    for (const code of Object.keys(NEW_SPECIFIC.owner!)) {
      const text = resolveOwnerProductRegisterError({ error: code, params: { max: 5 } }, "edit", tr("en")).description;
      expect(text, code).not.toBe(translate("en", "business_phase7_368"));
      expect(text, code).not.toMatch(/[가-힣]/);
      expect(text, code).not.toContain("{");
    }
  });
});

describe("E3·M6 — 필라이프 사진·거래 필수 칸 코드", () => {
  it("too_many_images 는 params.max", () => {
    const text = community.communityApiErrorText(
      { json: { ok: false, error: "too_many_images", code: "too_many_images", params: { max: 30 } } },
      community.COMMUNITY_POST_WRITE_ERROR_KEYS,
      "philife_write_err_register_failed",
      (key, vars) => translate("en", key, vars)
    );
    expect(text).toBe(translate("en", "philife_write_err_image_limit", { max: 30 }));
    expect(text).toContain("30");
  });

  it("required_field_missing → 필수 항목 문구", () => {
    expect(
      trade.tradeWriteErrorText({ json: { ok: false, error: "required_field_missing", params: { field: "price" } } }, (k, v) =>
        translate("ko", k, v)
      )
    ).toBe(translate("ko", "trade_write_err_required_fields"));
  });
});
