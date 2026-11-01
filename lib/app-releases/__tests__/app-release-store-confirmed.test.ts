/**
 * 업데이트 내역 = 스토어 확인 버전만 (notification-step4-designs-2026-11-02 §A · Owner 승인 2026-11-02).
 * 2026-11-01 시험 APK 설치 보고로 운영 행이 1.2.5 (24) → (31) 로 바뀐 결함의 재발 방지.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/notifications/core/notification-event-repository", () => ({
  createNotificationEvent: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/notifications/notification-user-language", () => ({
  loadNotificationUserLanguage: vi.fn(async () => "ko"),
}));
vi.mock("@/lib/notifications/inbox-read-bridge", () => ({
  patchInboxNotificationIdsRead: vi.fn(async () => ({ ok: true, updated: 0 })),
}));

const playMock = vi.fn();
const appStoreMock = vi.fn();
vi.mock("@/lib/app-releases/app-release-sources", () => ({
  collectPlayReleases: () => playMock(),
  collectAppStoreRelease: () => appStoreMock(),
}));

import { handleAppReleaseReport } from "@/lib/app-releases/app-release-report";

type Row = Record<string, unknown>;

function fakeSb(rows: Row[]) {
  const inserts: Row[] = [];
  const updates: { id: unknown; patch: Row }[] = [];
  const sb = {
    from(table: string) {
      if (table === "app_releases") {
        return {
          select: () => ({
            eq: (_c: string, platform: unknown) => ({
              limit: async () => ({ data: rows.filter((r) => r.platform === platform), error: null }),
            }),
          }),
          insert: async (row: Row) => {
            inserts.push(row);
            return { error: null };
          },
          update: (patch: Row) => ({
            eq: async (_c: string, id: unknown) => {
              updates.push({ id, patch });
              return { error: null };
            },
          }),
        };
      }
      // notification_events (안내 자동 읽음) — 해당 없음
      const chain: Record<string, unknown> = {};
      for (const k of ["select", "eq", "is"]) chain[k] = () => chain;
      chain.limit = async () => ({ data: [], error: null });
      return chain;
    },
  };
  return { sb: sb as never, inserts, updates };
}

const androidRow24 = {
  id: "a24",
  platform: "android",
  version_name: "1.2.5",
  version_code: 24,
  released_at: "2026-11-01T00:00:00Z",
  notes_ko: null,
  notes_en: null,
  store_url: null,
  rollout_status: "completed",
  source: "device_seen",
};

const play24 = {
  platform: "android",
  version_name: "1.2.5",
  version_code: 24,
  notes_ko: "바뀐 점",
  notes_en: null,
  store_url: "https://play.google.com/store/apps/details?id=com.dibay.app",
  rollout_status: "completed",
  released_at: null,
  source: "play_api",
};

beforeEach(() => {
  playMock.mockReset();
  appStoreMock.mockReset();
});

describe("Android — Play 트랙에 있는 빌드만 기록", () => {
  it("시험 APK (31) 보고 → 행 변화 없음 (2026-11-01 사례)", async () => {
    playMock.mockResolvedValue([play24]);
    const { sb, inserts, updates } = fakeSb([androidRow24]);
    const r = await handleAppReleaseReport(sb, "u1", { platform: "android", installed: { name: "1.2.5", code: 31 } });
    expect(r.recorded).toBe(false);
    expect(inserts).toEqual([]);
    expect(updates).toEqual([]);
  });

  it("Play 키 없음 → 기록하지 않음", async () => {
    playMock.mockResolvedValue(null);
    const { sb, inserts, updates } = fakeSb([]);
    const r = await handleAppReleaseReport(sb, "u1", { platform: "android", installed: { name: "1.2.6", code: 32 } });
    expect(r.recorded).toBe(false);
    expect(inserts).toEqual([]);
    expect(updates).toEqual([]);
  });

  it("Play 트랙에 있는 빌드 → 같은 이름 행을 Play 값으로 고침", async () => {
    playMock.mockResolvedValue([play24]);
    const { sb, inserts, updates } = fakeSb([androidRow24]);
    const r = await handleAppReleaseReport(sb, "u1", { platform: "android", installed: { name: "1.2.5", code: 24 } });
    expect(r.recorded).toBe(true);
    expect(inserts).toEqual([]);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ id: "a24", patch: { version_code: 24, source: "play_api", notes_ko: "바뀐 점" } });
  });

  it("이미 Play 로 확인된 빌드 → Play 를 다시 읽지 않음", async () => {
    const { sb } = fakeSb([{ ...androidRow24, source: "play_api" }]);
    await handleAppReleaseReport(sb, "u1", { platform: "android", installed: { name: "1.2.5", code: 24 } });
    expect(playMock).not.toHaveBeenCalled();
  });

  it("Play 조회 실패 → 보고 처리는 계속(오류 아님), 기록 없음", async () => {
    playMock.mockRejectedValue(new Error("play_token_failed"));
    const { sb, inserts } = fakeSb([]);
    const r = await handleAppReleaseReport(sb, "u1", { platform: "android", installed: { name: "1.2.6", code: 32 } });
    expect(r.recorded).toBe(false);
    expect(inserts).toEqual([]);
  });
});

describe("iOS — App Store 공개 버전과 같을 때만 기록 (날짜 = 출시일)", () => {
  it("App Store 미출시 → 기록 없음", async () => {
    appStoreMock.mockResolvedValue([]);
    const { sb, inserts, updates } = fakeSb([]);
    const r = await handleAppReleaseReport(sb, "u1", { platform: "ios", installed: { name: "1.2", code: 20 } });
    expect(r.recorded).toBe(false);
    expect(inserts).toEqual([]);
    expect(updates).toEqual([]);
  });

  it("App Store 버전과 다름(TestFlight·Xcode 빌드) → 기록 없음", async () => {
    appStoreMock.mockResolvedValue([
      { platform: "ios", version_name: "1.2", version_code: null, released_at: "2026-11-05T00:00:00Z", source: "itunes_lookup" },
    ]);
    const { sb, inserts } = fakeSb([]);
    const r = await handleAppReleaseReport(sb, "u1", { platform: "ios", installed: { name: "1.3", code: 21 } });
    expect(r.recorded).toBe(false);
    expect(inserts).toEqual([]);
  });

  it("App Store 버전과 같음 → itunes_lookup 행 · App Store 출시일", async () => {
    appStoreMock.mockResolvedValue([
      {
        platform: "ios",
        version_name: "1.3",
        version_code: null,
        notes_ko: "노트",
        notes_en: null,
        store_url: "https://apps.apple.com/app/x",
        rollout_status: "completed",
        released_at: "2026-11-05T00:00:00Z",
        source: "itunes_lookup",
      },
    ]);
    const { sb, inserts } = fakeSb([]);
    const r = await handleAppReleaseReport(sb, "u1", { platform: "ios", installed: { name: "1.3", code: 21 } });
    expect(r.recorded).toBe(true);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      platform: "ios",
      version_name: "1.3",
      source: "itunes_lookup",
      released_at: "2026-11-05T00:00:00Z",
    });
  });
});
