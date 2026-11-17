/**
 * 1:1 방 머리글 「마지막 접속」 — 처음부터 끝까지 (감사 §10, Owner 설계 승인 2026-11-16)
 * 서버 행 → 서버 읽기(H1) → 첫 값(F1, 없을 때만) → 실시간 접속 → 실시간 퇴장(H2) → 재조회 → 머리글 문구.
 * 시각은 DB 실측값(2026-11-16 q테스트1·w테스트1)을 쓴다.
 */
import { describe, expect, it } from "vitest";
import { resolvePresenceLastSeenAtFromDbRow } from "@/lib/community-messenger/presence/presence-last-seen";
import { applyPresenceSyncToMap } from "@/lib/community-messenger/realtime/presence/apply-presence-sync";
import { mergePresenceSnapshotsIntoStoreMap } from "@/lib/community-messenger/realtime/presence/merge-presence-snapshots";
import { resolveMessengerRoomHeaderStatusLine } from "@/lib/community-messenger/realtime/presence/resolve-room-header-status-line";
import { formatMessengerLastSeenYyMmDdHhMm } from "@/lib/community-messenger/realtime/presence/format-messenger-peer-presence-line";
import type { CommunityMessengerPeerPresenceSnapshot } from "@/lib/community-messenger/types";

type Entry = { userId: string; state: "online" | "away" | "offline"; lastSeenAt: string | null; updatedAt: string | null };
/** ko 카탈로그와 같은 문구를 돌려주는 시험용 t (P3: 접속 문구 i18n 키) */
const t = (k: string, vars?: Record<string, string | number>) =>
  k === "cm_presence_online" ? "온라인" : k === "cm_presence_last_seen_at" ? `마지막 접속 ${vars?.stamp}` : "오프라인";
const header = (map: Record<string, Entry>, id: string) => {
  const e = map[id];
  const r = resolveMessengerRoomHeaderStatusLine({
    roomType: "direct",
    typingLabel: null,
    peerUserId: id,
    peerPresence: e ? { userId: id, state: e.state, lastSeenAt: e.lastSeenAt } : null,
    roomHeaderStatus: "1:1 대화 · 설명",
    t,
  });
  return r.kind === "text" ? r.text : r.label;
};
const lastSeenLine = (iso: string) => `마지막 접속 ${formatMessengerLastSeenYyMmDdHhMm(iso)}`;
const serverSnap = (id: string, row: Parameters<typeof resolvePresenceLastSeenAtFromDbRow>[0]) =>
  new Map<string, CommunityMessengerPeerPresenceSnapshot>([
    [id, { userId: id, state: "offline", lastSeenAt: resolvePresenceLastSeenAtFromDbRow(row) }],
  ]);

describe("H1 — 서버 마지막 접속 = 세 기록 중 가장 늦은 시각", () => {
  it("정상 종료: last_seen_at", () => {
    expect(
      resolvePresenceLastSeenAtFromDbRow({
        last_seen_at: "2026-11-13T20:15:17.561Z",
        last_ping_at: null,
        updated_at: "2026-11-13T20:15:18.325Z",
      })
    ).toBe("2026-11-13T20:15:18.325Z");
  });
  it("강제 종료: 옛 last_seen_at 보다 하트비트가 늦으면 하트비트", () => {
    expect(
      resolvePresenceLastSeenAtFromDbRow({
        last_seen_at: "2026-11-16T03:06:25.934Z",
        last_ping_at: "2026-11-16T11:17:53.101Z",
        updated_at: "2026-11-16T11:17:53.101Z",
      })
    ).toBe("2026-11-16T11:17:53.101Z");
  });
  it("값이 없으면 null", () => {
    expect(resolvePresenceLastSeenAtFromDbRow({ last_seen_at: null, last_ping_at: null, updated_at: null })).toBeNull();
  });
});

describe("T1~T7 처음부터 끝까지", () => {
  it("T2: 강제 종료한 상대를 처음 열면 마지막 하트비트 시각", () => {
    const map = mergePresenceSnapshotsIntoStoreMap(
      {},
      serverSnap("q", {
        last_seen_at: "2026-11-16T03:06:25.934Z",
        last_ping_at: "2026-11-16T11:17:53.101Z",
        updated_at: "2026-11-16T11:17:53.101Z",
      }),
      { observedAtIso: "2026-11-16T11:19:46Z", fillOnly: true }
    );
    expect(header(map, "q")).toBe(lastSeenLine("2026-11-16T11:17:53.101Z"));
  });

  it("T3·T4: 방을 연 채 접속 → 온라인, 강제 종료로 빠지면 빠진 순간", () => {
    let map: Record<string, Entry> = mergePresenceSnapshotsIntoStoreMap(
      {},
      serverSnap("q", { last_seen_at: "2026-11-16T03:06:25.934Z", last_ping_at: null, updated_at: "2026-11-16T03:06:25.934Z" }),
      { observedAtIso: "2026-11-16T11:19:46Z", fillOnly: true }
    ) as Record<string, Entry>;
    map = applyPresenceSyncToMap(
      map,
      { q: { userId: "q", state: "online", lastSeenAt: null, updatedAt: "2026-11-16T11:21:09Z" } },
      "2026-11-16T11:21:10Z"
    );
    expect(header(map, "q")).toBe("온라인");
    map = applyPresenceSyncToMap(map, {}, "2026-11-16T11:22:08Z");
    expect(header(map, "q")).toBe(lastSeenLine("2026-11-16T11:22:08Z"));
    /** 이미 오프라인인 항목은 이후 sync 에서 시각이 바뀌지 않는다 */
    map = applyPresenceSyncToMap(map, {}, "2026-11-16T11:30:00Z");
    expect(header(map, "q")).toBe(lastSeenLine("2026-11-16T11:22:08Z"));
  });

  it("T1: 정상 종료한 상대는 종료 시각(현재 동작 유지)", () => {
    const map = mergePresenceSnapshotsIntoStoreMap(
      {},
      serverSnap("w", { last_seen_at: "2026-11-13T20:15:17.561Z", last_ping_at: null, updated_at: "2026-11-13T20:15:18.325Z" }),
      { observedAtIso: "2026-11-16T11:11:22Z", fillOnly: true }
    );
    expect(header(map, "w")).toBe(lastSeenLine("2026-11-13T20:15:18.325Z"));
  });

  it("T7: 재시작 뒤 서버 값도 마지막 하트비트", () => {
    const map = mergePresenceSnapshotsIntoStoreMap(
      {},
      serverSnap("q", {
        last_seen_at: "2026-11-16T03:06:25.934Z",
        last_ping_at: "2026-11-16T11:21:54Z",
        updated_at: "2026-11-16T11:21:54Z",
      }),
      { observedAtIso: "2026-11-16T11:30:00Z", fillOnly: true }
    );
    expect(header(map, "q")).toBe(lastSeenLine("2026-11-16T11:21:54Z"));
  });

  it("서버 읽기·실시간 동기화가 이 함수들을 쓴다(소스 계약)", async () => {
    const fs = await import("node:fs");
    const svc = fs.readFileSync("lib/community-messenger/service.ts", "utf8");
    expect(svc).toMatch(/lastSeenAt = resolvePresenceLastSeenAtFromDbRow\(row\)/);
    const rt = fs.readFileSync("lib/community-messenger/realtime/presence/use-community-messenger-presence-runtime.ts", "utf8");
    expect(rt).toMatch(/applyPresenceSyncToMap\(/);
  });
});
