import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 1단계 결함 D-10 (2026-10-26): 「보관된 채팅 (N)」 줄을 누르면 보관함이 열려야 한다.
 * 화면 상태만 바꾸고 주소를 그대로 두면 주소→탭 맞춤 처리가 「대화」로 되돌린다(실기기 03:37 재현).
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("D-10 보관된 채팅 줄", () => {
  const home = read("components/community-messenger/CommunityMessengerHome.tsx");

  it("탭 전환과 같은 경로(onPrimarySectionChange — 주소 갱신 포함)로 보관함을 연다", () => {
    const body = home.slice(home.indexOf("const openArchivedChatsStable"), home.indexOf("const openSettingsSheetStable"));
    expect(body).toContain('onPrimarySectionChange("archive")');
    expect(body).toContain('setSelectedArchiveSection("archived_chats")');
    expect(body).not.toContain('setMainSection("archive")');
  });

  it("설정 시트 열기 함수는 렌더마다 새로 만들지 않는다(주소→탭 맞춤 effect 재실행 방지)", () => {
    expect(home).toContain("openSettingsSheet={openSettingsSheetStable}");
    expect(home).not.toMatch(/openSettingsSheet=\{\(\) =>/);
  });
});
