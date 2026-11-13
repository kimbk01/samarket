// @vitest-environment jsdom
/**
 * 실제 훅 `useMessengerContacts` 를 그려서 확인 (감사 2026-11-14 최종 점검 누락 ②·중복):
 * - 로그아웃 정리 뒤 같은 회원 재로그인 → 서버의 이 기기 출처로 복구, 안내 없음, 전체 업로드 1회
 * - 분할 화면처럼 훅 2개가 함께 시작해도 기기 출처 조회 1번
 * - 이 기기 출처가 없는 기기는 화면을 다시 열어도 조회 1번 (앱 실행 중)
 * - 다른 기기 번호 0개면 「다른 기기 연락처」 안내 없음, 1개 이상이면 안내
 */
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const U = "user-hook";
const native = vi.hoisted(() => ({ contacts: [] as { id: string; name: string; numbers: string[] }[] }));
const api = vi.hoisted(() => ({
  sources: [] as { id: string; platform: "android"; syncEnabled: boolean; permissionState: string; lastUsedAt: string; lastSyncAt: null; entryCount: number; isThisDevice: boolean }[],
  sourcesCalls: 0,
  syncKinds: [] as string[],
}));

vi.mock("@/lib/community-messenger/contacts/contacts-native", () => ({
  isContactsNativeAvailable: () => true,
  contactsNativePlatform: () => "android",
  checkContactsPermission: async () => "granted",
  requestContactsPermission: async () => "granted",
  readPhoneContacts: async () => native.contacts,
}));
vi.mock("@/lib/auth/client-instance-id", async (orig) => ({
  ...(await orig<object>()),
  getBoundAuthUserId: () => "user-hook",
  ensureClientInstanceId: () => "inst-1",
}));
vi.mock("@/lib/community-messenger/contacts/contacts-api-client", () => ({
  acceptIncomingFriendRequestFromContacts: async () => ({ ok: true }),
  contactsApi: {
    settings: async () => ({
      ok: true,
      data: {
        featureEnabled: true,
        requestNumberLimit: 1000,
        settings: { consented: true, defaultCountry: "PH", callDefault: "ask", accountSyncEnabled: true },
      },
    }),
    list: async () => ({
      ok: true,
      data: { notModified: false, members: [], friendIds: [], knownRefs: [], friendRefs: {}, accountSyncOff: false, token: "t" },
    }),
    sources: async () => {
      api.sourcesCalls += 1;
      await new Promise((r) => setTimeout(r, 5));
      return { ok: true, data: { sources: api.sources } };
    },
    registerSource: async () => ({
      ok: true,
      data: {
        source: { source_id: "src-1", device_version: 0, removed: false, reactivated: false, sync_enabled: true, account_sync_enabled: true, permission_state: "unknown" },
        requestNumberLimit: 1000,
      },
    }),
    sync: async (body: Record<string, unknown>) => {
      api.syncKinds.push(String(body.kind));
      return { ok: true, data: { generation: 1, device_version: api.syncKinds.length, committed: true } };
    },
    patchSource: async () => ({ ok: true, data: {} }),
  },
}));

import { useMessengerContacts, invalidateMessengerContactsCache, type MessengerContactsView } from "@/lib/community-messenger/contacts/use-messenger-contacts";
import { patchContactsLocalState, readContactsLocalState } from "@/lib/community-messenger/contacts/contacts-local-store";
import { wipeAllExceptDevicePrefs } from "@/lib/auth/client-session-wipe";

const views: MessengerContactsView[] = [];
function Probe({ slot }: { slot: number }) {
  const c = useMessengerContacts();
  useEffect(() => {
    views[slot] = c.view;
  });
  return null;
}

const row = (id: string, isThisDevice: boolean, entryCount: number) => ({
  id, platform: "android" as const, syncEnabled: true, permissionState: "unknown", lastUsedAt: "", lastSyncAt: null, entryCount, isThisDevice,
});
const book = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i), name: `P${i}`, numbers: [`0917${String(1000000 + i)}`] }));

let roots: Root[] = [];
async function mount(count: number) {
  for (let i = 0; i < count; i += 1) {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    roots.push(root);
    await act(async () => root.render(<Probe slot={i} />));
  }
  for (let i = 0; i < 20; i += 1) await act(async () => new Promise((r) => setTimeout(r, 5)));
}
async function unmountAll() {
  for (const r of roots) await act(async () => r.unmount());
  roots = [];
}

beforeEach(() => {
  localStorage.clear();
  invalidateMessengerContactsCache();
  native.contacts = book(3);
  api.sources = [];
  api.sourcesCalls = 0;
  api.syncKinds = [];
  views.length = 0;
});
afterEach(async () => {
  await unmountAll();
});

describe("useMessengerContacts — 재로그인 복구·조회 1번", () => {
  it("로그아웃 정리 뒤 재로그인: 훅 2개(분할 화면)가 함께 시작해도 조회 1번 · 복구 · 안내 없음 · 전체 업로드 1회", async () => {
    patchContactsLocalState(U, { consented: true, deviceApproved: true, sourceId: "src-1", defaultCountry: "PH" });
    wipeAllExceptDevicePrefs(); // 로그아웃 정리와 같은 함수
    expect(readContactsLocalState(U).sourceId).toBeNull();
    api.sources = [row("src-1", true, 3)];

    await mount(2);

    expect(api.sourcesCalls).toBe(1);
    expect(readContactsLocalState(U).sourceId).toBe("src-1");
    expect(api.syncKinds).toEqual(["snapshot_chunk"]);
    for (const v of views) {
      expect(v.phase).toBe("ready");
      expect(v.deviceApprovalNeeded).toBe(false);
      expect(v.otherDeviceOnly).toBe(false);
    }
  });

  it("이 기기 출처 없음: 화면을 닫았다 다시 열어도 조회 1번 (앱 실행 중)", async () => {
    api.sources = [row("other", false, 4)];
    await mount(1);
    expect(views[0].deviceApprovalNeeded).toBe(true);
    expect(views[0].otherDeviceOnly).toBe(true);
    await unmountAll();
    await mount(1);
    expect(api.sourcesCalls).toBe(1);
    expect(api.syncKinds).toEqual([]);
  });

  it("다른 기기 번호 0개 → 「다른 기기 연락처」 안내 없음 (이 기기 허락만 묻는다)", async () => {
    api.sources = [row("other", false, 0)];
    await mount(1);
    expect(views[0].otherDeviceOnly).toBe(false);
    expect(views[0].deviceApprovalNeeded).toBe(true);
    expect(api.sourcesCalls).toBe(1);
  });
});
