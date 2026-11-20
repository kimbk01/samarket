// @vitest-environment jsdom
/**
 * 연락처 새로고침 보완 계약 SSOT v5 §19 C1~C4 (2026-11-20 · A단계).
 * - C2: 수동(⟳) 진행 알림 — 시작·끝 1번씩, 겹쳐 눌러도 1번만 돌고 같은 결과.
 * - C2: 자동 비교가 도는 중에 ⟳ → 자동 결과(6시간 안 건너뜀)를 돌려주지 않고 끝난 뒤 수동으로 한 번 더 (잘못된 「오늘 한도」 안내 방지).
 * - C1·C3·C4: 세 곳이 같은 버튼·결과 문구를 쓰고, 관리 설정에 「연락처 새로고침」 줄·마지막 새로고침, 섹션 상시 표시.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  contacts: [] as { id: string; name: string; numbers: string[] }[],
  reads: 0,
  gate: null as Promise<void> | null,
}));
const api = vi.hoisted(() => ({ syncBodies: [] as Record<string, unknown>[] }));

vi.mock("@/lib/community-messenger/contacts/contacts-native", () => ({
  isContactsNativeAvailable: () => true,
  contactsNativePlatform: () => "android",
  checkContactsPermission: async () => {
    if (native.gate) await native.gate;
    return "granted";
  },
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
    patchSource: async () => ({ ok: true, data: {} }),
  },
}));

import {
  CONTACTS_MANUAL_SYNC_EVENT,
  isContactsManualSyncRunning,
  runContactsSync,
  type ContactsManualSyncEventDetail,
} from "@/lib/community-messenger/contacts/contacts-sync-engine";
import { patchContactsLocalState, readContactsLocalState } from "@/lib/community-messenger/contacts/contacts-local-store";

const U = "user-r";
const ROOT = path.resolve(__dirname, "../../../..");
const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");

function book(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: String(i), name: `P${i}`, numbers: [`0917${String(1000000 + i)}`] }));
}

function captureEvents() {
  const seen: ContactsManualSyncEventDetail[] = [];
  const on = (e: Event) => seen.push((e as CustomEvent<ContactsManualSyncEventDetail>).detail);
  window.addEventListener(CONTACTS_MANUAL_SYNC_EVENT, on);
  return { seen, stop: () => window.removeEventListener(CONTACTS_MANUAL_SYNC_EVENT, on) };
}

beforeEach(() => {
  localStorage.clear();
  native.contacts = book(3);
  native.reads = 0;
  native.gate = null;
  api.syncBodies = [];
  patchContactsLocalState(U, { consented: true, deviceApproved: true, defaultCountry: "PH" });
});

describe("§19 C2 수동 새로고침 진행 알림", () => {
  it("⟳ 1번 = 시작·끝 알림 1번씩, 끝 알림에 결과", async () => {
    const ev = captureEvents();
    const p = runContactsSync(U, { manual: true });
    expect(isContactsManualSyncRunning(U)).toBe(true);
    expect(await p).toBe("uploaded");
    ev.stop();
    expect(isContactsManualSyncRunning(U)).toBe(false);
    expect(ev.seen).toEqual([
      { userId: U, running: true },
      { userId: U, running: false, outcome: "uploaded" },
    ]);
  });

  it("두 곳에서 겹쳐 눌러도 연락처 읽기 1번 · 같은 결과 · 끝 알림 1번", async () => {
    const ev = captureEvents();
    const [a, b] = await Promise.all([runContactsSync(U, { manual: true }), runContactsSync(U, { manual: true })]);
    ev.stop();
    expect(a).toBe("uploaded");
    expect(b).toBe("uploaded");
    expect(native.reads).toBe(1);
    expect(ev.seen.filter((d) => !d.running)).toHaveLength(1);
  });

  it("자동 비교는 진행 알림을 보내지 않는다 (⟳ 가 앱 시작마다 돌지 않음)", async () => {
    const ev = captureEvents();
    await runContactsSync(U);
    ev.stop();
    expect(ev.seen).toHaveLength(0);
  });

  it("자동 비교(6시간 안 건너뜀)가 도는 중 ⟳ → 끝난 뒤 수동으로 한 번 더 · 결과는 수동 결과", async () => {
    await runContactsSync(U, { manual: true }); // 첫 업로드 → lastSyncAt 기록
    native.contacts = book(4); // 폰에 연락처 1개 추가
    native.reads = 0;
    let open!: () => void;
    native.gate = new Promise<void>((r) => (open = r));
    const auto = runContactsSync(U); // 자동 — 6시간 안이라 건너뛸 실행
    const manual = runContactsSync(U, { manual: true });
    native.gate = null;
    open();
    expect(await auto).toBe("throttled");
    expect(await manual).toBe("uploaded");
    expect(native.reads).toBe(1);
    expect(api.syncBodies.at(-1)?.kind).toBe("delta");
  });

  it("변경 없음도 마지막 새로고침 시각을 남긴다 (§19 C3)", async () => {
    await runContactsSync(U, { manual: true });
    patchContactsLocalState(U, { lastSyncAt: 1 });
    expect(await runContactsSync(U, { manual: true })).toBe("unchanged");
    expect(readContactsLocalState(U).lastSyncAt).toBeGreaterThan(1);
  });
});

describe("§19 C1·C3·C4 화면 계약", () => {
  const section = read("components/community-messenger/contacts/MessengerContactsFriendSection.tsx");
  const screen = read("components/community-messenger/contacts/MessengerContactsScreen.tsx");
  const settings = read("components/community-messenger/contacts/MessengerContactsSettingsScreen.tsx");

  it("C1: 세 곳 모두 같은 ⟳ 버튼·같은 결과 문구 훅", () => {
    for (const [src, attr] of [
      [section, "section"],
      [screen, "screen"],
      [settings, "settings"],
    ] as const) {
      expect(src).toContain("ContactsRefreshButton");
      expect(src).toContain("useContactsRefreshAction");
      expect(src).toContain("useContactsManualSyncRunning");
      expect(src).toContain(`dataAttr="${attr}"`);
    }
    // 결과 문구 표는 공용 훅 1곳에만
    expect(screen).not.toContain("REFRESH_RESULT_KEY");
  });

  it("C1②·C3: 관리 설정 「연락처 새로고침」 줄 + 마지막 새로고침 · 꺼져 있으면 누를 수 없음", () => {
    expect(settings).toContain('t("cm_contacts_refresh_row")');
    expect(settings).toContain('"cm_contacts_last_refresh"');
    expect(settings).toMatch(/disabled=\{!thisSource\.syncEnabled \|\| !settings\.accountSyncEnabled/);
    expect(settings).toContain("runContactsSync(userId, { manual: true })");
  });

  it("C4: 이 기기 허락·권한 상태면 0명이어도 섹션 + 빈 안내", () => {
    expect(section).toContain("!hasBanner && !deviceReady) return null");
    expect(section).toContain("data-cm-contacts-section-empty");
    expect(section).toContain('t("cm_contacts_empty")');
  });

  it("문구 키는 ko·en 동시", () => {
    const cat = read("lib/i18n/catalog/community-messenger-contacts.ts");
    expect(cat.match(/cm_contacts_refresh_row:/g)).toHaveLength(2);
    expect(cat.match(/cm_contacts_last_refresh:/g)).toHaveLength(2);
  });
});
