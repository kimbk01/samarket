import { describe, expect, it } from "vitest";
import {
  addFileRuleCounts,
  areaFromUsage,
  collectKeyRuleFindings,
  diffFileRule,
  diffKeyRule,
  emptyFileRuleCounts,
  glossaryHits,
  jargonHit,
  lengthBudgetForKey,
} from "@/lib/i18n/quality/i18n-quality-rules";
import { parseCatalogSource } from "./support/collect-i18n-quality";

describe("i18n-quality 규칙", () => {
  it("개발자 용어를 잡고 치환값 이름은 무시한다", () => {
    expect(jargonHit("Supabase is not connected", "en")).toBe("Supabase");
    expect(jargonHit("Apply the migration and try again", "en")).toBe("migration");
    expect(jargonHit("Check posts.seller_listing_state", "en")).not.toBeNull();
    expect(jargonHit("Open /mypage/section", "en")).toBe("/mypage");
    expect(jargonHit("{seller_name} sent you a message", "en")).toBeNull();
    expect(jargonHit("스키마를 업데이트해 주세요", "ko")).toBe("스키마");
    expect(jargonHit("학원 원장님 소개", "ko")).toBeNull();
    expect(jargonHit("친구 / 관심 사용자", "ko")).toBeNull();
  });

  it("용어집 위반을 잡고 다른 뜻 문맥은 뺀다", () => {
    expect(glossaryHits("내정보에서 확인", "Check in My Info")).toEqual(["myinfo"]);
    expect(glossaryHits("내정보에서 확인", "Check in My page")).toEqual([]);
    expect(glossaryHits("탈퇴 신청하기", "Request to leave")).toEqual(["account-deletion"]);
    expect(glossaryHits("모임에서 탈퇴", "Leave the meeting")).toEqual([]);
    expect(glossaryHits("캐시 삭제", "Clear cache")).toEqual(["device-temporary-data"]);
  });

  it("치환값 불일치·영어 안 한글·중복 키를 잡는다", () => {
    const f = collectKeyRuleFindings({
      ko: { a_one: "{n}건", b_two: "안 읽음", c_three: "확인" },
      en: { a_one: "Items", b_two: "안 읽음", c_three: "OK" },
      sources: [
        { source: "x.ts", ko: { c_three: "확인" }, en: { c_three: "OK" } },
        { source: "y.ts", ko: { c_three: "확인" }, en: {} },
      ],
      areaOfKey: () => "user",
    });
    expect([...f["placeholder-parity"].keys()]).toEqual(["a_one"]);
    expect([...f["hangul-in-en"].keys()]).toEqual(["b_two"]);
    expect([...f["duplicate-key"].keys()]).toEqual(["c_three"]);
  });

  it("카탈로그 파서는 직접 적힌 키만 읽고 펼침은 무시한다", () => {
    const src = parseCatalogSource(
      "z.ts",
      `export const m = { ko: { ...other.ko, a_b: "가", "c_d": \`나\` }, en: { a_b: "A" } } as const;`
    );
    expect(src.ko).toEqual({ a_b: "가", c_d: "나" });
    expect(src.en).toEqual({ a_b: "A" });
  });

  it("코드 안 다른 언어 글자·언어 코드·카탈로그 밖 문구를 센다", () => {
    const c = emptyFileRuleCounts();
    addFileRuleCounts(
      c,
      "components/x.tsx",
      `const a = "参与"; const l = "zh-CN"; t("k", { fallbackEn: "Hi" }); const o = { ko: "가", en: "A" }; lang === "en" ? 1 : 2; tt("저장");`
    );
    expect(c["foreign-script-code"].get("components/x.tsx")).toBe(2);
    expect(c["foreign-locale-code"].get("components/x.tsx")).toBe(1);
    expect(c["non-catalog-fallback-en"].get("components/x.tsx")).toBe(1);
    expect(c["non-catalog-inline-ko-en"].get("components/x.tsx")).toBe(1);
    expect(c["non-catalog-lang-ternary"].get("components/x.tsx")).toBe(1);
    expect(c["non-catalog-tt"].get("components/x.tsx")).toBe(1);
    const allowed = emptyFileRuleCounts();
    addFileRuleCounts(allowed, "lib/community-messenger/call-provider/agora-playback-routing.ts", `/扬声器/`);
    expect(allowed["foreign-script-code"].size).toBe(0);
  });

  it("기준선 비교 — 새 항목·고쳐진 항목", () => {
    expect(diffKeyRule(new Map([["a", ""], ["b", ""]]), ["b", "c"])).toEqual({ added: ["a"], fixed: ["c"] });
    expect(diffFileRule(new Map([["f", 3]]), { f: 2, g: 1 })).toEqual({ added: ["f 2→3"], fixed: ["g 1→0"] });
  });

  it("키 영역·길이 기준", () => {
    expect(areaFromUsage("x_y", new Set(["admin"]))).toBe("admin");
    expect(areaFromUsage("x_y", new Set(["admin", "user"]))).toBe("user");
    expect(areaFromUsage("admin_x", undefined)).toBe("admin");
    expect(areaFromUsage("store_x", undefined)).toBe("user");
    expect(lengthBudgetForKey("nav_bottom_my")).toBe(12);
    expect(lengthBudgetForKey("nav_bottom_bar_aria")).toBeNull();
    expect(lengthBudgetForKey("trade_detail_buy_cta")).toBe(22);
  });
});
