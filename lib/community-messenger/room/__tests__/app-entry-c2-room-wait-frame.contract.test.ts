/**
 * 앱 진입 SSOT C2 (`docs/audit/app-entry-ssot-fix-design-2026-11-26.md` §11 · Owner 「C1′로 진행」 2026-11-26).
 * OS 화면이 진입 목적지 경로 도착 첫 프레임에 걷히므로(C1′), 방을 기다리는 모든 단계가 문구·스피너 대기 화면 대신
 * 방과 같은 틀(상단바 + 대화 배경)이어야 한다: 경로 로딩 → 로그인 확인 → 방 데이터. 방 데이터는 기기 저장본을 먼저 쓴다.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("C2 — 방을 기다리는 단계 = 방 틀", () => {
  it("경로 로딩(loading.tsx): 휴대폰·분할 모두 방 틀", () => {
    const host = strip(read("components/community-messenger/room/MessengerRoomSplitLoadingFrame.tsx"));
    expect(host).toContain("<MessengerSplitRoomEntryFrame");
    expect(host).not.toContain("useIsMessengerSplitViewport");
  });

  it("로그인 확인 차단: 메신저 방 경로(통화 제외)는 방 틀 · 그 밖 경로는 이전 그대로", () => {
    const src = strip(read("components/auth/AuthSessionBoundary.tsx"));
    expect(src).toMatch(
      /const blockedScreen = roomPreShellBackSlot \? \(\s*<MessengerSplitRoomEntryFrame dataAttrs=\{\{ "data-auth-session-boundary": "blocked" \}\}/
    );
    expect(src).toContain("<DibayPendingSpinner layout=\"inline\" />");
    const pre = strip(read("components/community-messenger/room/MessengerRoomPreShellBackOwner.tsx"));
    expect(pre).toMatch(/startsWith\("\/community-messenger\/rooms\/"\)/);
  });

  it("방 데이터 대기(EntryEmpty): 문구·스피너 없음 · 실패만 문구·다시 시도", () => {
    const src = strip(read("components/community-messenger/room/CommunityMessengerRoomEntryEmpty.tsx"));
    expect(src).not.toContain("DibaySpinner");
    expect(src).toContain('safeT("cm_ui_timeline_retry")');
    expect(src.match(/<MessengerSplitRoomEntryFrame/g)?.length).toBe(2);
  });

  it("틀 상단바 클래스: 분할이면 분할 클래스 · 휴대폰이면 실제 방 상단바와 같은 기본값", () => {
    const frame = strip(read("components/community-messenger/room/MessengerSplitRoomEntryFrame.tsx"));
    expect(frame).toContain("<MessengerHeader className={isSplit ? SPLIT_ROOM_ENTRY_FRAME_HEADER_CLASS : undefined}>");
    const header = read("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx");
    expect(header).toMatch(/isMessengerSplit\s*\?\s*"min-w-0 overflow-hidden pt-\[var\(--safe-top\)\]"\s*:\s*undefined/);
  });

  it("틀 첫 렌더는 서버와 같다(이름 저장본은 그리기 전 layout effect 에서) — 휴대폰 loading.tsx 서버 렌더 하이드레이션 안전", () => {
    const frame = strip(read("components/community-messenger/room/MessengerSplitRoomEntryFrame.tsx"));
    expect(frame).toContain("useState<string | null>(null)");
    expect(frame).toMatch(/useLayoutEffect\(\(\) => \{\s*setSeedRaw\(/);
  });
});

describe("C2 — 게이트: 기기 저장본 먼저 · 서버는 그대로 함께", () => {
  const src = strip(read("components/community-messenger/room/CommunityMessengerRoomBootstrapGate.tsx"));
  const cold = src.slice(src.indexOf("setBootstrapPending(true);\n    entrySnapshotRef.current = null;"));

  it("메모리 저장본이 없을 때: 기기 저장본(같은 보는 사람)을 읽고, 서버 요청은 기다리지 않고 함께 나간다", () => {
    expect(cold).toMatch(/void getLocalRoomSnapshot\(rid, viewerForLocal\)/);
    expect(cold.indexOf("getLocalRoomSnapshot(")).toBeLessThan(cold.indexOf("prepareStoreOrderMessengerRoomEntryByRoomId("));
    expect(cold).toMatch(/if \(viewerForLocal && !isRoomLeftLocally\(rid\)\)/);
  });

  it("저장본은 방을 그릴 수 있고 같은 방일 때만, 서버가 먼저 오면 버린다", () => {
    expect(cold).toMatch(/if \(cancelled \|\| networkSettled \|\| !local\) return;/);
    expect(cold).toContain("if (!canMountCommunityMessengerRoomClient(local)) return;");
    expect(cold).toContain("if (normalizedRoomId(local.room.id) !== rid) return;");
  });

  it("서버 일시 실패: 저장본으로 이미 그렸으면 실패 화면으로 바꾸지 않는다 · 접근 거부는 이전처럼 처리", () => {
    expect(cold).toMatch(/networkSettled = true;\s*if \(cancelled\) return;\s*if \(entrySnapshotRef\.current\) return;\s*setEntryTransientFailed\(true\);/);
    expect(cold).toMatch(/if \(!result\.ok\) \{\s*setEntryError\(result\.error\);/);
  });
});
