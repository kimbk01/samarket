import { describe, expect, it } from "vitest";
import {
  mapLegacySupportNotificationBody,
  mapLegacySupportNotificationTitle,
} from "@/lib/notifications/support-legacy-notification-copy";
import {
  resolveNotificationInboxBody,
  resolveNotificationInboxTitle,
} from "@/lib/notifications/resolve-commerce-notification-inbox-text";

/** 실기 2026-11-27 16:44 PHT (운영 b1a70f8) — 옛 고객센터 알림 제목·본문 언어 결함 */
const HANGUL = /[가-힣]/;
const CODE_LIKE = /[A-Z]{3,}|[a-z]+_[a-z_]+/;

describe("옛 고객센터 알림 제목", () => {
  it("영어 화면 — 한글 없음, 문의 번호 유지", () => {
    expect(mapLegacySupportNotificationTitle("en", "문의 SC-100032 종료")).toBe("Inquiry SC-100032 closed");
    expect(mapLegacySupportNotificationTitle("en", "문의 SC-100032 재오픈")).toBe("Inquiry SC-100032 reopened");
    expect(mapLegacySupportNotificationTitle("en", "문의 SC-100032")).toBe("Inquiry SC-100032");
  });
  it("한국어 화면 — 원래 문장", () => {
    expect(mapLegacySupportNotificationTitle("ko", "문의 SC-100032 종료")).toBe("문의 SC-100032 종료");
  });
  it("문의 번호가 아니거나 다른 종류면 그대로(null)", () => {
    expect(mapLegacySupportNotificationTitle("en", "문의 안내 드립니다")).toBeNull();
    expect(mapLegacySupportNotificationTitle("en", "문의 SC-100032", "admin_notice")).toBeNull();
    expect(mapLegacySupportNotificationTitle("en", "문의 SC-100032", "support_case_created")).toBe("Inquiry SC-100032");
  });
});

describe("옛 고객센터 알림 본문", () => {
  it("「코드 · 진입 화면 코드」 → 카테고리 이름 (영어 한글 0 · 한국어 코드 0)", () => {
    const en = mapLegacySupportNotificationBody("en", "ACCOUNT · mypage_customer_center");
    expect(en).toBe("Account inquiry");
    const ko = mapLegacySupportNotificationBody("ko", "ACCOUNT · mypage_customer_center");
    expect(ko).toBe("계정 문의");
    expect(ko).not.toMatch(CODE_LIKE);
  });
  it("고정 문장", () => {
    expect(mapLegacySupportNotificationBody("en", "상담이 종료되었습니다.")).toBe("The consultation has ended.");
    expect(mapLegacySupportNotificationBody("en", "상담이 다시 열렸습니다.")).toBe("The consultation has been reopened.");
  });
  it("모르는 코드·사람이 쓴 글은 null", () => {
    expect(mapLegacySupportNotificationBody("en", "NOT_A_CATEGORY · x_y")).toBeNull();
    expect(mapLegacySupportNotificationBody("en", "안녕하세요 답변 드립니다")).toBeNull();
    expect(mapLegacySupportNotificationBody("en", "ACCOUNT · mypage_customer_center", "chat_message")).toBeNull();
  });
});

describe("알림함 함수 경로 (notification_type=system)", () => {
  it("영어 — 제목·본문 한글 0, 코드 0", () => {
    const row = {
      notification_type: "system",
      title: "문의 SC-100032 종료",
      body: "ACCOUNT · mypage_customer_center",
      meta: null,
      event_type: "support_case_resolved",
    };
    const title = resolveNotificationInboxTitle("en", row);
    const body = resolveNotificationInboxBody("en", row);
    expect(title).not.toMatch(HANGUL);
    expect(body).not.toMatch(HANGUL);
    expect(body).not.toMatch(CODE_LIKE);
  });
  it("새 행(meta 키)은 meta 가 우선", () => {
    const title = resolveNotificationInboxTitle("en", {
      notification_type: "system",
      title: "문의 상담이 끝났어요",
      meta: { titleKey: "notify_support_case_resolved_title" },
      event_type: "support_case_resolved",
    });
    expect(title).toBe("Your inquiry has been closed");
  });
});
