import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n/messages";
import { FAVORITE_MANAGE_TABS } from "@/lib/mypage/favorite-manage-tabs";

/** 재감사 설계 S1~S4 (docs/audit/trade-full-reaudit-from-start-2026-11-04.md · Owner 「설계안 승인」 2026-11-04) */
const src = (p: string) => readFileSync(p, "utf8");

describe("S1 내가 신고한 글 = 같은 자리 · 판매완료처럼 흐리게 · 사선 금지 · 「신고한 글입니다」", () => {
  const card = src("components/post/PostCard.tsx");

  it("빈 칸 카드가 없고, 신고한 글은 판매완료 분기(흑백·흐림·누름 막힘)를 탄다", () => {
    expect(card).not.toContain("ReportedPostCard");
    expect(card).toContain("const isReported = !showcase && isReportedByMe;");
    expect(card).toContain('const isSoldOrClosed = statusLower === "sold" || isUnavailable || isReported;');
    /** 판매완료와 같은 흐림 값 · 누름 막힘 */
    expect(card).toContain("[&>*:not([data-trade-card-status])]:opacity-55 [&>*:not([data-trade-card-status])]:grayscale");
    expect(card).toContain('className={`flex min-w-0 flex-col ${isSoldOrClosed ? "pointer-events-none select-none" : ""}`}');
    expect(card).toContain("const menuEnabled = !isSoldOrClosed && !showcase;");
  });

  it("사선은 흑백 처리에서 빠지고(빨간 줄 유지) 칩 아래 층 · 칩 문구 = 「신고한 글입니다」", () => {
    expect(card).toContain('data-trade-card-status="reported-slash"');
    expect(card).toContain("var(--sam-danger)");
    expect(card).toContain('data-trade-card-status={isReported ? "reported" : "sold"}');
    expect(card).toMatch(/\{isReported\s*\?\s*t\("trade_card_status_reported"\)/);
    expect(translate("ko", "trade_card_status_reported")).toBe("신고한 글입니다");
    expect(translate("en", "trade_card_status_reported")).toBe("Reported");
  });

  it("옛 빈 칸 문구 키는 남아 있지 않다", () => {
    expect(src("lib/i18n/catalog/ui-phase-finish.ts")).not.toContain("ui_post_reported_placeholder");
  });
});

describe("S2 전역 검색도 숨김·삭제 방송을 받으면 카드를 뺀다", () => {
  it("홈·카테고리와 같은 수신 함수", () => {
    const v = src("components/search/global/GlobalSearchView.tsx");
    expect(v).toContain("useTradeListingVisibilityRemoval((postId) => setTradePosts((prev) => prev.filter((p) => p.id !== postId)))");
  });
});

describe("S3 찜 탭 「볼 수 없는 글」", () => {
  it("숨김·삭제 탭 이름 = 볼 수 없는 글 (판매완료는 「거래완료」 탭)", () => {
    expect(FAVORITE_MANAGE_TABS.find((t) => t.id === "gone")?.label).toBe("볼 수 없는 글");
    expect(translate("ko", "tab_sold_out_deleted")).toBe("볼 수 없는 글");
    expect(translate("en", "tab_sold_out_deleted")).toBe("Unavailable");
  });
});

describe("S4 숨김 글 승인 알림은 사실대로", () => {
  it("승인 결과 waiting=listing 일 때만 「승인됨 · 글이 보이면 노출 시작」 문구", () => {
    const admin = src("lib/admin/trade-admin/trade-promotion-admin.ts");
    expect(admin).toContain('waitingListing: input.action === "approve" && r.waiting === "listing"');
    const notify = src("lib/notifications/notify-trade-moderation.ts");
    expect(notify).toContain('const approvedWaiting = args.kind === "approved" && args.waitingListing === true;');
    expect(notify).toContain('"notify_trade_promotion_approved_waiting_title"');
    expect(notify).toContain('"notify_trade_promotion_approved_waiting_body"');
    expect(translate("ko", "notify_trade_promotion_approved_waiting_title")).toBe("상위노출이 승인되었습니다");
    expect(translate("ko", "notify_trade_promotion_approved_waiting_body")).toContain("글을 다시 보이게 하면 그때부터 노출이 시작돼요");
    /** 글이 보이는 상태의 승인 문구는 그대로 */
    expect(translate("ko", "notify_trade_promotion_approved_body")).toBe("신청하신 거래글 상위노출이 승인되어 노출을 시작합니다.");
  });
});
