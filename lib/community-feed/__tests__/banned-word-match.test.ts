import { describe, expect, it } from "vitest";
import {
  BASELINE_BANNED_TERMS,
  matchBannedWords,
  normalizeOperatorBannedWords,
} from "@/lib/community-feed/banned-word-match";

const blocked = (text: string, operator: string[] = []) => matchBannedWords([text], operator) !== null;

describe("matchBannedWords — 기본 목록(운영 목록 0개여도 적용)", () => {
  it.each([
    "씨발 진짜",
    "이 시발놈아",
    "병신같은 판매자",
    "개새끼",
    "ㅅㅂ 뭐야",
    "fuck you",
    "What the FUCK",
    "you motherfucker",
    "putangina mo",
    "Putang ina mo talaga",
    "tangina",
    "child porn link",
    "조건만남 하실 분",
  ])("차단: %s", (text) => {
    expect(blocked(text)).toBe(true);
  });

  it("운영 목록이 비어 있어도 기본 목록은 걸린다", () => {
    expect(matchBannedWords(["씨발"], [])).toEqual({ source: "baseline", category: "profanity" });
  });

  it("결과에 원문·걸린 단어를 담지 않는다", () => {
    const m = matchBannedWords(["fuck"], []);
    expect(Object.keys(m ?? {}).sort()).toEqual(["category", "source"]);
  });
});

describe("matchBannedWords — 우회 입력", () => {
  it.each([
    ["공백", "씨 발"],
    ["기호", "씨.발"],
    ["숫자 삽입", "씨1발"],
    ["제로폭 문자", "씨\u200B발"],
    ["전각 문자", "ｆｕｃｋ"],
    ["한 글자씩 띄움", "f u c k off"],
    ["점 구분", "f.u.c.k"],
    ["대소문자", "FuCk"],
    ["늘인 글자", "fuuuuck"],
    ["숫자 치환", "pu7angina"],
    ["하이픈 붙임", "child-porn"],
  ])("%s: %s", (_label, text) => {
    expect(blocked(text)).toBe(true);
  });
});

describe("matchBannedWords — 정상 문장 오차단 방지", () => {
  it.each([
    "다시 발송해 드릴게요",
    "다시발송 완료",
    "신제품 출시 발표회 안내",
    "출시발표 일정",
    "시발점이 어디인가요",
    "시발역 근처 직거래",
    "질병 신고 방법",
    "질병신고 접수처",
    "병신년 역사 공부",
    "아저씨 발 사이즈 270",
    "class schedule",
    "assistant manager wanted",
    "Scunthorpe United jersey",
    "Niger travel guide",
    "kiddie pool for sale",
    "Tang Dynasty vase",
    "Kantor office desk",
    "Fuchsia flowers",
    "pokemon cards",
    "shabu shabu restaurant",
    "Child portrait photography",
    "중고 아동 포토북 판매",
    "개 새 사료 팝니다",
  ])("통과: %s", (text) => {
    expect(blocked(text)).toBe(false);
  });
});

describe("matchBannedWords — 운영 목록", () => {
  it("한글 운영어는 낱말 안 부분일치", () => {
    expect(matchBannedWords(["사기꾼새끼야"], ["사기꾼"])).toEqual({ source: "operator", category: "operator" });
  });

  it("영문 운영어는 낱말 전체 일치(정상 단어 내부는 통과)", () => {
    expect(blocked("total scam", ["scam"])).toBe(true);
    expect(blocked("scampi pasta", ["scam"])).toBe(false);
  });

  it("운영 목록 정규화 — 전각·대소문자·중복 정리", () => {
    expect(normalizeOperatorBannedWords(["SPAM", " spam ", "ｓｐａｍ", 3, ""])).toEqual(["spam"]);
  });
});

describe("BASELINE_BANNED_TERMS", () => {
  it("빈 항목·중복이 없다", () => {
    const terms = BASELINE_BANNED_TERMS.map((t) => t.term);
    expect(terms.every((t) => t.trim().length > 0)).toBe(true);
    expect(new Set(terms).size).toBe(terms.length);
  });
});
