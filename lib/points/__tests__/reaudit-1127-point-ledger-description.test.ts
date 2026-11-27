/**
 * 언어 재감사 2026-11-27 §4-3 — 포인트 원장 설명(옛 457행 포함)을 보는 사람 언어로.
 * 저장 글자는 예전 코드와 같아야 하고(관리자 화면·옛 행 호환), 영어 화면은 한글 0·정보 숨김 없음.
 */
import { describe, expect, it } from "vitest";
import {
  buildCommunityPointLedgerDescription,
  buildPointLedgerDescription,
  buildRewardExecutionLedgerDescription,
  localizePointLedgerDescription,
} from "@/lib/points/point-ledger-description";

const HANGUL = /[가-힣]/;

describe("저장 글자 = 예전 코드", () => {
  it("광고·피드 광고", () => {
    expect(buildPointLedgerDescription("point_desc_ad_purchase", { name: "Top Ad" })).toBe("Top Ad 광고 구매");
    expect(buildPointLedgerDescription("point_desc_ad_apply_refund", { name: "Top Ad" })).toBe("Top Ad 신청 실패 환불");
    expect(buildPointLedgerDescription("point_desc_feed_ad_hold")).toBe("피드 광고 신청 — 포인트 보류");
    expect(buildPointLedgerDescription("point_desc_feed_ad_capture", { cost: 300 })).toBe("피드 광고 승인 — 300P 확정");
  });

  it("커뮤니티 보상", () => {
    expect(
      buildCommunityPointLedgerDescription({
        actionType: "write",
        isQna: false,
        topicSlug: "free",
        boardName: "",
        rewardType: "random",
        randomMin: 1,
        randomMax: 10,
        basePoint: 5,
        multiplier: 2,
        content: "hello   world",
      })
    ).toBe('커뮤니티 게시글 작성 · free · 랜덤 1~10P 중 5P ×2 · "hello world"');
    expect(
      buildCommunityPointLedgerDescription({
        actionType: "comment",
        isQna: false,
        topicSlug: "",
        boardName: "",
        rewardType: "fixed",
        randomMin: 0,
        randomMax: 0,
        basePoint: 3,
        multiplier: 1,
        content: "ok",
      })
    ).toBe('커뮤니티 댓글 작성 · 커뮤니티 · 고정 3P · "ok"');
  });

  it("게시판 보상 실행", () => {
    expect(buildRewardExecutionLedgerDescription({ actionType: "write", boardName: "자유" })).toBe("글쓰기 보상 (자유)");
    expect(buildRewardExecutionLedgerDescription({ actionType: "comment", boardName: "Q", reason: " 이벤트 " })).toBe(
      "댓글 보상 (Q) · 관리자 지급 사유: 이벤트"
    );
  });
});

describe("영어 화면 — 시스템 문장은 영어로, 사람이 쓴 값은 그대로", () => {
  const legacy = [
    "Top Ad 광고 구매",
    "Top Ad 신청 실패 환불",
    "피드 광고 신청 — 포인트 보류",
    "피드 광고 신청 — 보류 행 생성 실패 환급",
    "피드 광고 거절/취소 — 보류 해제",
    "피드 광고 승인 — 300P 확정",
    "피드 광고 승인 실패 보상 — 확정 포인트 환급",
    "피드 광고 승인 실패 보상 — 보류 해제",
    '커뮤니티 질문 작성 · Q&A · 랜덤 1~10P 중 5P · "how to"',
    '커뮤니티 댓글 작성 · 커뮤니티 · 고정 3P ×1.5 · "nice"',
    "글쓰기 보상 (Free)",
    "댓글 보상 (Free) · 관리자 지급 사유: bonus",
  ];
  for (const s of legacy) {
    it(s, () => {
      const out = localizePointLedgerDescription("en", s);
      expect(out).toBeTruthy();
      expect(HANGUL.test(out!), out!).toBe(false);
    });
  }

  it("값 보존", () => {
    expect(localizePointLedgerDescription("en", "피드 광고 승인 — 300P 확정")).toContain("300P");
    expect(localizePointLedgerDescription("en", '커뮤니티 댓글 작성 · My · Board · 고정 3P · "x · y"')).toBe(
      'Community comment · My · Board · Fixed 3P · "x · y"'
    );
  });

  it("한국어 화면은 같은 글자", () => {
    const s = '커뮤니티 게시글 작성 · free · 랜덤 1~10P 중 5P ×2 · "hi"';
    expect(localizePointLedgerDescription("ko", s)).toBe(s);
  });

  it("대응표에 없는 설명(관리자 입력)은 null → 화면이 원문 그대로 (숨기지 않음)", () => {
    expect(localizePointLedgerDescription("en", "운영 보상 지급")).toBeNull();
  });
});
