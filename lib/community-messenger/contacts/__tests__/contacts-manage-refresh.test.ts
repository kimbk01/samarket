/**
 * 관리 › 연락처 동기화 ⟳ (Owner 2026-11-20 「기존 기능은 건드리지 말고 친구 - 관리 - 연락처 동기화 스피너 새로고침」).
 * - ⟳ 는 관리(보관함) 「연락처 동기화」 줄에만 · 동의 회원 · 앱만
 * - 누를 때만 수동 동기화 (자동 찾기 추가 없음) · 올렸으면 연락처 캐시 비움 → 친구 탭에 새 회원
 * - 친구 탭 섹션·연락처 화면·설정 화면·엔진은 이 기능으로 바뀌지 않음
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../../..");
const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");

describe("관리 › 연락처 동기화 ⟳", () => {
  const archive = read("components/community-messenger/MessengerArchiveScreen.tsx");

  it("연락처 동기화 줄에만, 동의 회원만", () => {
    expect(archive).toContain("trailing={contactsSummary.consented ? <ContactsRefreshNow /> : null}");
    expect(archive.match(/<ContactsRefreshNow \/>/g)).toHaveLength(1);
  });

  it("앱(연락처 기능 있는 바이너리)에서만 · 누를 때 수동 동기화 · 스피너", () => {
    expect(archive).toContain("if (!isContactsNativeAvailable()) return null;");
    expect(archive).toContain("runContactsSync(userId, { manual: true })");
    expect(archive).toContain('spinning ? "animate-spin" : ""');
    expect(archive).toContain("disabled={spinning}");
  });

  it("올렸으면 연락처 캐시를 비워 친구 탭이 새 목록을 받는다", () => {
    expect(archive).toMatch(/outcome === "uploaded"[\s\S]{0,200}invalidateMessengerContactsCache\(\)/);
  });

  it("기존 화면·엔진에 ⟳ 추가 없음", () => {
    expect(read("components/community-messenger/contacts/MessengerContactsFriendSection.tsx")).not.toContain("RefreshCw");
    expect(read("components/community-messenger/contacts/MessengerContactsSettingsScreen.tsx")).not.toContain("RefreshCw");
    expect(read("lib/community-messenger/contacts/contacts-sync-engine.ts")).not.toContain("CONTACTS_MANUAL_SYNC_EVENT");
  });
});
