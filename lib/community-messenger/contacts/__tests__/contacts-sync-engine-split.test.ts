// @vitest-environment jsdom
/**
 * 동기화 엔진 × 저장값 분리 (실기 감사 2026-11-11):
 * 처음 = 전체 스냅숏 후 번호표 저장 · 다음 = 바뀐 것만 · 6시간 안 자동 실행 = 연락처·큰 값을 읽지 않음 · 권한 철회 = 번호표 삭제.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  contacts: [] as { id: string; name: string; numbers: string[] }[],
  permission: "granted" as "granted" | "denied" | "prompt",
  reads: 0,
}));
const api = vi.hoisted(() => ({ syncBodies: [] as Record<string, unknown>[], patchBodies: [] as Record<string, unknown>[] }));

vi.mock("@/lib/community-messenger/contacts/contacts-native", () => ({
  isContactsNativeAvailable: () => true,
  contactsNativePlatform: () => "android",
  checkContactsPermission: async () => native.permission,
  readPhoneContacts: async () => {
    native.reads += 1;
    return native.contacts;
  },
}));
vi.mock("@/lib/auth/client-instance-id", () => ({ ensureClientInstanceId: () => "inst-1" }));
vi.mock("@/lib/community-messenger/contacts/contacts-api-client", () => ({
  contactsApi: {
    registerSource: async () => ({
      ok: true,
      data: {
        source: { source_id: "src-1", device_version: 0, removed: false, reactivated: false, sync_enabled: true, account_sync_enabled: true, permission_state: "unknown" },
        requestNumberLimit: 1000,
      },
    }),
    sync: async (body: Record<string, unknown>) => {
      api.syncBodies.push(body);
      return { ok: true, data: { generation: 1, device_version: api.syncBodies.length, committed: true } };
    },
    patchSource: async (_id: string, body: Record<string, unknown>) => {
      api.patchBodies.push(body);
      return { ok: true, data: {} };
    },
  },
}));

import { runContactsSync } from "@/lib/community-messenger/contacts/contacts-sync-engine";
import {
  patchContactsLocalState,
  readContactsLocalState,
  readContactsNames,
  readContactsNumbers,
} from "@/lib/community-messenger/contacts/contacts-local-store";

const U = "user-e";

function book(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: String(i), name: `P${i}`, numbers: [`0917${String(1000000 + i)}`] }));
}

beforeEach(() => {
  localStorage.clear();
  native.contacts = book(5);
  native.permission = "granted";
  native.reads = 0;
  api.syncBodies = [];
  api.patchBodies = [];
  patchContactsLocalState(U, { consented: true, deviceApproved: true, defaultCountry: "PH" });
});

describe("동기화 엔진 × 저장값 분리", () => {
  it("처음: 전체 스냅숏 → 번호표·이름표 따로 저장, 작은 상태에는 개수만", async () => {
    expect(await runContactsSync(U, { manual: true })).toBe("uploaded");
    expect(api.syncBodies[0]?.kind).toBe("snapshot_chunk");
    const st = readContactsLocalState(U);
    expect(st.numbersCount).toBe(5);
    expect(Object.keys(readContactsNumbers(U) ?? {}).length).toBe(5);
    expect(Object.keys(readContactsNames(U)).length).toBe(5);
    expect(localStorage.getItem("dibay:cm-contacts:v1:" + U) ?? "").not.toContain("+63917");
  });

  it("다음: 바뀐 것만 올린다 (추가 1 · 삭제 1)", async () => {
    await runContactsSync(U, { manual: true });
    native.contacts = [...book(5).slice(1), { id: "new", name: "New", numbers: ["09179999999"] }];
    expect(await runContactsSync(U, { manual: true })).toBe("uploaded");
    const delta = api.syncBodies[1];
    expect(delta?.kind).toBe("delta");
    expect((delta?.add as unknown[]).length).toBe(1);
    expect((delta?.remove as unknown[]).length).toBe(1);
    expect(readContactsLocalState(U).numbersCount).toBe(5);
  });

  it("6시간 안 자동 실행: 연락처를 읽지 않고 큰 값(번호표·이름표)도 읽지 않는다", async () => {
    await runContactsSync(U, { manual: true });
    native.reads = 0;
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    expect(await runContactsSync(U)).toBe("throttled");
    expect(native.reads).toBe(0);
    expect(getItem.mock.calls.some((c) => /#[nm]$/.test(String(c[0])))).toBe(false);
    getItem.mockRestore();
  });

  it("권한 철회: 서버에 알리고 번호표 삭제·이름표는 보이는 회원만, 안내 개수 = 올린 번호 수", async () => {
    await runContactsSync(U, { manual: true });
    native.permission = "denied";
    expect(await runContactsSync(U, { manual: true })).toBe("permission_revoked");
    expect(api.patchBodies.at(-1)?.permissionState).toBe("denied");
    const st = readContactsLocalState(U);
    expect(st.revokePending).toBe(true);
    expect(st.revokeCount).toBe(5);
    expect(st.numbersCount).toBeNull();
    expect(readContactsNumbers(U)).toBeNull();
    expect(readContactsNames(U)).toEqual({});
  });
});
