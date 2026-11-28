import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { moimErrorKey } from "@/lib/moim/moim-client-api";
import { getMessengerRoomActionErrorMessage } from "@/lib/community-messenger/room/messenger-room-action-error-messages";
import { translate } from "@/lib/i18n/messages";
import type { MoimCategoryDto } from "@/lib/moim/moim-api-types";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("R3 U-15 moimErrorKey — 공용 제한 코드", () => {
  it("세 코드를 일반 안내가 아닌 전용 키로 잇는다", () => {
    expect(moimErrorKey("member_activity_restricted")).toBe("api_err_member_activity_restricted");
    expect(moimErrorKey("community_restricted")).toBe("moim_err_community_restricted");
    expect(moimErrorKey("community_restriction_unavailable")).toBe("moim_err_community_restriction_unavailable");
  });

  it("기존 동작 유지 — moim_* 는 moim_err_*, 모르는 코드는 일반 안내", () => {
    expect(moimErrorKey("moim_full")).toBe("moim_err_moim_full");
    expect(moimErrorKey("whatever")).toBe("moim_err_moim_unknown");
    expect(moimErrorKey(null)).toBe("moim_err_moim_unknown");
  });

  it("새 키는 ko·en 둘 다 있고 서로 다르다", () => {
    for (const k of ["moim_err_community_restricted", "moim_err_community_restriction_unavailable"] as const) {
      const ko = translate("ko", k);
      const en = translate("en", k);
      expect(ko.length).toBeGreaterThan(0);
      expect(en.length).toBeGreaterThan(0);
      expect(en).not.toBe(ko);
      expect(en).not.toMatch(/[가-힣]/);
    }
  });
});

describe("R3 U-14 방 화면 오류 — 모임 방 코드 4개", () => {
  it("실제 카탈로그 문구로 바뀐다(일반 실패 문구가 아님)", () => {
    const t = (key: Parameters<typeof translate>[1]) => translate("ko", key);
    const generic = translate("ko", "nav_messenger_action_failed");
    for (const code of [
      "moim_room_membership_managed_by_moim",
      "moim_room_settings_managed_by_moim",
      "moim_room_owner_immutable",
      "moim_room_create_requires_moim",
    ]) {
      const msg = getMessengerRoomActionErrorMessage(code, t);
      expect(msg, code).toBe(translate("ko", `moim_err_${code}` as Parameters<typeof translate>[1]));
      expect(msg, code).not.toBe(generic);
    }
  });
});

describe("R3 G-i18n-03 카테고리 이름 — 다른 언어로 대신하지 않음", () => {
  const cat = (labelKo: string, labelEn: string) => ({ id: "c1", slug: "sports", labelKo, labelEn }) as unknown as MoimCategoryDto;

  it("그 언어 이름이 있으면 그 이름", async () => {
    const { moimCategoryLabel } = await import("@/components/moim/moim-ui");
    expect(moimCategoryLabel(cat("운동", "Sports"), "ko")).toBe("운동");
    expect(moimCategoryLabel(cat("운동", "Sports"), "en")).toBe("Sports");
  });

  it("영어 이름이 비면 한국어 이름이 아니라 영어 대체 키", async () => {
    const { moimCategoryLabel, moimTopicOrCategoryLabel } = await import("@/components/moim/moim-ui");
    expect(moimCategoryLabel(cat("운동", ""), "en")).toBe(translate("en", "community_topic_label_fallback"));
    expect(moimCategoryLabel(cat("운동", ""), "en")).not.toMatch(/[가-힣]/);
    expect(moimTopicOrCategoryLabel({ topicLabel: null, category: cat("운동", "") }, "en")).toBe(
      translate("en", "community_topic_label_fallback")
    );
  });

  it("한국어 이름이 비면 영어 이름이 아니라 한국어 대체 키", async () => {
    const { moimCategoryLabel } = await import("@/components/moim/moim-ui");
    expect(moimCategoryLabel(cat("", "Sports"), "ko")).toBe(translate("ko", "community_topic_label_fallback"));
  });

  it("카테고리가 없으면 빈 문자열(기존 동작)", async () => {
    const { moimCategoryLabel } = await import("@/components/moim/moim-ui");
    expect(moimCategoryLabel(null, "en")).toBe("");
  });
});

describe("R3 W3 · D-25 메신저 배지 · U-14 홈 · 머리글 버튼 (구조 확인)", () => {
  it("목록 모임 배지 pill · 일정 배지 gray · 모임 배지 primary-soft", () => {
    const src = read("components/community-messenger/MessengerChatListItem.tsx");
    const start = src.indexOf('data-cm-list-moim-badge=""');
    expect(start).toBeGreaterThan(0);
    const badge = src.slice(start, start + 400);
    expect(badge).toContain("rounded-full");
    expect(badge).not.toContain("rounded-ui-rect");
    expect(badge).toContain('moimRoomOwner.kind === "schedule" ? "bg-sam-surface-muted text-sam-muted" : "bg-sam-primary-soft text-sam-primary"');
  });

  it("머리글 「모임 홈」 버튼 = 4px 버튼 · 44px", () => {
    const src = read("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx");
    const start = src.indexOf('data-moim-room-home="header"');
    const btn = src.slice(start, start + 400);
    expect(btn).toContain("rounded-ui-rect");
    expect(btn).toContain("min-h-[length:var(--sam-tap-min)]");
    expect(btn).not.toContain("rounded-full");
  });

  it("홈 나가기 거절 = 모임 문구 + 모임을 알면 이동 동작", () => {
    const src = read("components/community-messenger/CommunityMessengerHome.tsx");
    const start = src.indexOf('result.error === "moim_room_membership_managed_by_moim"');
    expect(start).toBeGreaterThan(0);
    const block = src.slice(start, start + 900);
    expect(block).toContain("peekMoimRoomOwner(roomId)");
    expect(block).toContain('t("moim_err_moim_room_membership_managed_by_moim")');
    expect(block).toContain("router.push(moimRoomOwnerHref(owner))");
    expect(block).toContain(": {}");
  });
});
