// @vitest-environment jsdom
/**
 * 같은 회원 로그아웃 → 재로그인 (감사 2026-11-14 R1·R3).
 * 로그아웃 정리(인증 계약 §1.4 · `clearEphemeralLocalStorage`)는 연락처 기기 저장값을 지운다.
 * 서버의 이 기기 출처(설치 ID)로 되찾아 다시 묻지 않고, 전체 스냅숏은 1회만 · 그 뒤는 바뀐 것만.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ contacts: [] as { id: string; name: string; numbers: string[] }[] }));
const api = vi.hoisted(() => ({
  syncBodies: [] as Record<string, unknown>[],
  sources: [] as { id: string; platform: "android"; syncEnabled: boolean; permissionState: string; lastUsedAt: string; lastSyncAt: null; entryCount: number; isThisDevice: boolean }[],
  sourcesCalls: 0,
}));

vi.mock("@/lib/community-messenger/contacts/contacts-native", () => ({
  isContactsNativeAvailable: () => true,
  contactsNativePlatform: () => "android",
  checkContactsPermission: async () => "granted",
  readPhoneContacts: async () => native.contacts,
}));
vi.mock("@/lib/auth/client-instance-id", async (orig) => ({ ...(await orig<object>()), ensureClientInstanceId: () => "inst-1" }));
vi.mock("@/lib/community-messenger/contacts/contacts-api-client", () => ({
  contactsApi: {
    registerSource: async () => ({
      ok: true,
      data: {
        source: { source_id: "src-1", device_version: api.syncBodies.length, removed: false, reactivated: false, sync_enabled: true, account_sync_enabled: true, permission_state: "unknown" },
        requestNumberLimit: 1000,
      },
    }),
    sync: async (body: Record<string, unknown>) => {
      api.syncBodies.push(body);
      return { ok: true, data: { generation: 1, device_version: api.syncBodies.length, committed: true } };
    },
    sources: async () => {
      api.sourcesCalls += 1;
      return { ok: true, data: { sources: api.sources } };
    },
    patchSource: async () => ({ ok: true, data: {} }),
  },
}));

import { runContactsSync } from "@/lib/community-messenger/contacts/contacts-sync-engine";
import { patchContactsLocalState, readContactsLocalState } from "@/lib/community-messenger/contacts/contacts-local-store";
import { hasOtherDeviceContacts, restoreContactsDeviceFromServer } from "@/lib/community-messenger/contacts/contacts-device-restore";
import { wipeAllExceptDevicePrefs } from "@/lib/auth/client-session-wipe";

const U = "user-r";
const book = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i), name: `P${i}`, numbers: [`0917${String(1000000 + i)}`] }));
const row = (id: string, isThisDevice: boolean, entryCount: number) => ({
  id, platform: "android" as const, syncEnabled: true, permissionState: "unknown", lastUsedAt: "", lastSyncAt: null, entryCount, isThisDevice,
});

/** 재로그인 후 친구 탭이 하는 순서 (use-messenger-contacts start) — 서버 동의 기록 → 출처 없으면 복구 → 자동 동기화 */
async function friendTabAfterRelogin() {
  patchContactsLocalState(U, { consented: true, defaultCountry: "PH" });
  const local = readContactsLocalState(U);
  const restore = !local.sourceId && !local.deviceApproved ? await restoreContactsDeviceFromServer(U) : null;
  return { restore, outcome: await runContactsSync(U, { manual: false }) };
}

beforeEach(() => {
  localStorage.clear();
  native.contacts = book(5);
  api.syncBodies = [];
  api.sources = [];
  api.sourcesCalls = 0;
});

describe("같은 회원 로그아웃 → 재로그인 (R1)", () => {
  it("로그아웃 정리는 연락처 기기 저장값을 지운다 (인증 계약 그대로)", async () => {
    patchContactsLocalState(U, { consented: true, deviceApproved: true, defaultCountry: "PH" });
    expect(await runContactsSync(U, { manual: true })).toBe("uploaded");
    wipeAllExceptDevicePrefs();
    const st = readContactsLocalState(U);
    expect(st.sourceId).toBeNull();
    expect(st.deviceApproved).toBe(false);
  });

  it("서버에 이 기기 출처가 있으면 되찾아 묻지 않고, 전체 스냅숏 1회 뒤에는 바뀐 것만 올린다", async () => {
    patchContactsLocalState(U, { consented: true, deviceApproved: true, defaultCountry: "PH" });
    await runContactsSync(U, { manual: true });
    wipeAllExceptDevicePrefs();
    api.syncBodies = [];
    api.sources = [row("src-1", true, 5)];

    const { restore, outcome } = await friendTabAfterRelogin();
    expect(restore?.restored).toBe(true);
    expect(outcome).toBe("uploaded"); // device_not_approved 아님 = 안내 없음
    expect(readContactsLocalState(U).sourceId).toBe("src-1");
    expect(api.syncBodies.map((b) => b.kind)).toEqual(["snapshot_chunk"]);

    native.contacts = [...book(5), { id: "n", name: "N", numbers: ["09179999999"] }];
    expect(await runContactsSync(U, { manual: true })).toBe("uploaded");
    expect(api.syncBodies.at(-1)?.kind).toBe("delta");
    expect(api.sourcesCalls).toBe(1);
  });

  it("다시 로그인해도 출처가 기기에 있으면 서버 조회를 하지 않는다", async () => {
    patchContactsLocalState(U, { consented: true, deviceApproved: true, defaultCountry: "PH", sourceId: "src-1" });
    const { restore } = await friendTabAfterRelogin();
    expect(restore).toBeNull();
    expect(api.sourcesCalls).toBe(0);
  });

  it("이 기기 출처가 없으면(지운 기기·올린 적 없음) 되찾지 않고 기존대로 이 기기 허락을 묻는다", async () => {
    api.sources = [row("src-other", false, 3)];
    const { restore, outcome } = await friendTabAfterRelogin();
    expect(restore).toEqual({ restored: false, othersWithNumbers: true });
    expect(outcome).toBe("device_not_approved");
    expect(readContactsLocalState(U).sourceId).toBeNull();
  });
});

describe("「다른 기기에서 동기화한 연락처가 있어요」 대상 (R3)", () => {
  it("다른 기기라도 번호 0개면 대상 아님 · 이 기기는 제외", () => {
    expect(hasOtherDeviceContacts([row("a", false, 0)])).toBe(false);
    expect(hasOtherDeviceContacts([row("a", true, 9)])).toBe(false);
    expect(hasOtherDeviceContacts([row("a", false, 0), row("b", false, 1)])).toBe(true);
  });
});
