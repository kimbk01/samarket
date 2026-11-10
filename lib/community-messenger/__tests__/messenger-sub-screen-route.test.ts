import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildMessengerSubScreenHref,
  isMessengerHomeSubScreenSearch,
  messengerSubScreenBackHref,
  messengerSubScreenKey,
  parseMessengerSubScreen,
  parseMessengerSubScreenKey,
  resolveMessengerSubScreenTier1,
} from "@/lib/community-messenger/messenger-sub-screen-route";
import { resolveMessengerSection } from "@/lib/community-messenger/messenger-ia";
import { resolveMainTier1Subpage } from "@/lib/layout/resolve-main-tier1";
import { translate } from "@/lib/i18n/messages";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** 채팅 시안 4판 「6」「7」「8」 — 친구 고르기·채팅 설정·채팅 검색은 주소로 여는 하위 화면 */
describe("채팅 하위 화면 주소", () => {
  it("주소 읽기 — 친구 고르기(1:1·그룹) · 설정(첫 화면·상세) · 검색", () => {
    expect(parseMessengerSubScreen("?section=pick&mode=group")).toEqual({ kind: "pick", mode: "group" });
    expect(parseMessengerSubScreen("?section=pick")).toEqual({ kind: "pick", mode: "direct" });
    expect(parseMessengerSubScreen("?section=settings")).toEqual({ kind: "settings", page: "root" });
    expect(parseMessengerSubScreen("?section=settings&settings=call")).toEqual({ kind: "settings", page: "call" });
    expect(parseMessengerSubScreen("?section=settings&settings=junk")).toEqual({ kind: "settings", page: "root" });
    expect(parseMessengerSubScreen("?section=search")).toEqual({ kind: "search" });
    expect(parseMessengerSubScreen("?section=chats")).toBeNull();
    expect(parseMessengerSubScreen("?section=archive")).toBeNull();
  });

  it("주소 만들기 — 진입 출처(from) 유지 · 키 왕복", () => {
    expect(buildMessengerSubScreenHref({ kind: "pick", mode: "group" })).toBe(
      "/community-messenger?section=pick&mode=group"
    );
    expect(buildMessengerSubScreenHref({ kind: "settings", page: "root" }, "delivery")).toBe(
      "/community-messenger?section=settings&from=delivery"
    );
    expect(buildMessengerSubScreenHref({ kind: "settings", page: "meeting" })).toBe(
      "/community-messenger?section=settings&settings=meeting"
    );
    for (const screen of [
      { kind: "pick", mode: "direct" },
      { kind: "settings", page: "friends" },
      { kind: "search" },
    ] as const) {
      expect(parseMessengerSubScreenKey(messengerSubScreenKey(screen))).toEqual(screen);
    }
  });

  it("하위 화면 section 은 대화 탭으로 읽힌다 (아래 탭 상태 유지)", () => {
    for (const section of ["pick", "settings", "search"]) {
      expect(resolveMessengerSection(section, undefined)).toBe("chats");
    }
  });

  it("뒤로(기록 없을 때) — 설정 상세 = 설정 첫 화면, 나머지 = 대화 탭", () => {
    expect(messengerSubScreenBackHref({ kind: "settings", page: "call" })).toBe("/community-messenger?section=settings");
    expect(messengerSubScreenBackHref({ kind: "settings", page: "root" }, "trade")).toBe(
      "/community-messenger?section=chats&from=trade"
    );
    expect(messengerSubScreenBackHref({ kind: "pick", mode: "group" })).toBe("/community-messenger?section=chats");
    expect(messengerSubScreenBackHref({ kind: "search" })).toBe("/community-messenger?section=chats");
  });

  it("공통 하위 화면 머리글 — 첫 프레임 제목·뒤로·기록 우선 (채팅 전용 머리글 없음)", () => {
    const cases: [string, string][] = [
      ["?section=pick&mode=group", "그룹 대화"],
      ["?section=pick&mode=direct", "1:1 대화"],
      ["?section=settings", "채팅 설정"],
      ["?section=settings&settings=call", "통화"],
      ["?section=settings&settings=conversation", "대화"],
      ["?section=settings&settings=meeting", "모임"],
      ["?section=settings&settings=friends", "친구"],
      ["?section=search", "채팅 검색"],
    ];
    for (const [q, title] of cases) {
      const r = resolveMainTier1Subpage("/community-messenger", q);
      expect(r?.titleText).toBe(resolveMessengerSubScreenTier1(q)?.titleText);
      expect(translate("ko", r!.titleText as never)).toBe(title);
      expect(r?.preferHistoryBack).toBe(true);
      expect(r?.showHubQuickActions).toBe(false);
      expect(isMessengerHomeSubScreenSearch(q)).toBe(true);
    }
    expect(isMessengerHomeSubScreenSearch("?section=archive")).toBe(true);
    expect(isMessengerHomeSubScreenSearch("?section=chats")).toBe(false);
  });

  it("허브 머리글 대신 하위 화면 머리글 — RegionBar·1단 덮어쓰기·분할 머리글이 같은 판정을 쓴다", () => {
    expect(read("components/layout/RegionBar.tsx")).toContain("isMessengerHomeSubScreenSearch(searchParams)");
    const effects = read("lib/community-messenger/home/use-community-messenger-home-shell-effects.tsx");
    expect(effects).toContain("isMessengerHomeSubScreenSearch(queryString)");
    expect(effects).toContain("messengerSubScreenBackHref(splitSubScreen");
    /** 옛 주소 `?tab=settings` 는 설정 시트가 아니라 설정 하위 화면 */
    expect(effects).toContain('openSettingsScreen("replace")');
  });
});

describe("채팅 홈 — 하위 화면 연결", () => {
  const home = read("components/community-messenger/CommunityMessengerHome.tsx");

  it("머리글 돋보기 = 채팅 검색, 톱니 = 채팅 설정 하위 화면 (앱 전체 검색·설정 시트 아님)", () => {
    expect(home).toContain('onOpenSearch={() => openMessengerSubScreen({ kind: "search" })}');
    expect(home).toContain('onOpenSettings={() => openMessengerSubScreen({ kind: "settings", page: "root" })}');
    expect(home).not.toContain("MessengerSettingsSheet");
    expect(home).not.toContain("MessengerSearchSheet");
    expect(home).not.toContain("openGlobalSearchFromHere");
  });

  it("「그룹 대화」 = 친구 고르기로 바로 (「비공개 그룹 / 모임」 고르는 단계 없음)", () => {
    expect(home).toContain('onPickGroup={() => openMessengerSubScreen({ kind: "pick", mode: "group" })}');
    expect(home).toContain('onPickDirect={() => openMessengerSubScreen({ kind: "pick", mode: "direct" })}');
    expect(home).not.toContain('setGroupCreateStep("select")');
    expect(home).not.toContain("cm_ui_which_group_to_create");
  });

  it("친구 고르기 = 친구 탭과 같은 친구 목록 · 1:1 은 친구 탭 줄과 같은 방 열기 · 그룹은 기존 비공개 그룹 만들기 경로", () => {
    expect(home).toContain("friends: sortedFriends,");
    expect(home).toContain("void startDirectRoom(userId);");
    expect(home).toContain('void createPrivateGroupWith({ memberIds: pickSelectedIds, title: "" });');
    expect(home).toContain('groupType: "private_group"');
  });

  it("모임 만들기·모임 찾기는 채팅 설정 「모임」에서 그대로 열린다", () => {
    expect(home).toContain('const onOpenOpenGroupCreateStable = useCallback(() => setGroupCreateStep("open_group"), []);');
    expect(home).toContain('openHomeOverlay("public-group-find")');
  });
});
