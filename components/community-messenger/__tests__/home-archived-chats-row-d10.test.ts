import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 1단계 결함 D-10 (2026-10-26): 「보관된 채팅 (N)」 줄을 누르면 보관함이 열려야 한다.
 * 화면 상태만 바꾸고 주소를 그대로 두면 주소→탭 맞춤 처리가 「대화」로 되돌린다(실기기 03:37 재현).
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("D-10 보관함 줄", () => {
  const home = read("components/community-messenger/CommunityMessengerHome.tsx");

  it("주소 갱신을 포함한 경로로 보관함을 연다 — 채팅 시안 4판: 기록을 쌓아(push) 보관함 뒤로 = 대화 탭", () => {
    const body = home.slice(home.indexOf("const openArchivedChatsStable"), home.indexOf("const openSettingsSheetStable"));
    expect(body).toContain('openMessengerArchive("chats")');
    const nav = read("lib/community-messenger/home/use-community-messenger-home-navigation.ts");
    const open = nav.slice(nav.indexOf("const openMessengerArchive"));
    expect(open).toContain('pendingUserSectionRef.current = "archive"');
    expect(open).toContain('setMainSection("archive")');
    expect(open).toContain("router.push(nextUrl");
    /** 채팅 시안 4판: 대화 맨 아래 「보관함」 줄 → 보관함 첫 화면(목록 고르기) — 보관한 채팅 상세로 바로 가지 않는다 */
    expect(body).toContain("setSelectedArchiveSection(null)");
    expect(body).not.toContain('setMainSection("archive")');
  });

  it("설정 화면 열기 함수는 렌더마다 새로 만들지 않는다(주소→탭 맞춤 effect 재실행 방지) — 설정은 시트가 아니라 하위 화면(채팅 시안 4판 「7」)", () => {
    expect(home).toContain("openSettingsScreen={openSettingsScreenStable}");
    expect(home).not.toMatch(/openSettingsScreen=\{\(\) =>/);
  });

  it("채팅 시안 4판: 「보관함」 줄은 대화 목록 맨 아래 항상(보관 수와 무관), 예전 「보관된 채팅 (N)」 줄 없음", () => {
    const sections = read("components/community-messenger/MessengerHomeMainSections.tsx");
    expect(sections).toContain('mainSection === "chats" && chatListVisual === "default" ? (');
    expect(sections).toContain('t("nav_messenger_archive")');
    expect(sections).toContain('t("cm_ui_chat_archive_entry_hint")');
    expect(sections).not.toContain("archivedChatsCount");
    expect(sections).not.toContain("cm_ui_archived_chats_row");
  });
});
