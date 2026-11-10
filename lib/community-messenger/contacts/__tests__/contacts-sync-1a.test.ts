import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  contactsErrorStatus,
  isAcceptedContactE164,
  isValidContactsInstallId,
  normalizeContactPhoneE164,
  parseContactsSyncRequest,
} from "@/lib/community-messenger/contacts/contacts-contract";
import {
  contactsInstallRefHex,
  contactsPhoneHmacHex,
  readContactsPhoneHmacKey,
  toByteaParam,
} from "@/lib/community-messenger/contacts/contacts-crypto.server";
import { parseContactsSettingsPatch } from "@/lib/community-messenger/contacts/contacts-service.server";

const SOURCE = "11111111-2222-3333-4444-555555555555";

describe("연락처 번호 정규화 (SSOT v5 §4 S4)", () => {
  it("필리핀 기본: 09·9·639·+63 표기 → +639…", () => {
    for (const raw of ["0917 123 4567", "917-123-4567", "639171234567", "+63 917 123 4567", "(0917) 123-4567"]) {
      expect(normalizeContactPhoneE164(raw, "PH")).toBe("+639171234567");
    }
  });
  it("한국 기본: 010 → +8210…, 국제 표기도 인식", () => {
    expect(normalizeContactPhoneE164("010-1234-5678", "KR")).toBe("+821012345678");
    expect(normalizeContactPhoneE164("+82 10 1234 5678", "PH")).toBe("+821012345678");
    expect(normalizeContactPhoneE164("0082 10 1234 5678", "PH")).toBe("+821012345678");
  });
  it("다른 나라·유선·형식 불가 → null", () => {
    expect(normalizeContactPhoneE164("+1 415 555 0100", "PH")).toBeNull();
    expect(normalizeContactPhoneE164("02-123-4567", "KR")).toBeNull();
    expect(normalizeContactPhoneE164("010-1234-5678", "PH")).toBeNull();
    expect(normalizeContactPhoneE164("12345", "PH")).toBeNull();
    expect(normalizeContactPhoneE164(undefined, "PH")).toBeNull();
  });
  it("서버 수용 형식은 +63 9… / +82 1… 휴대폰만", () => {
    expect(isAcceptedContactE164("+639171234567")).toBe(true);
    expect(isAcceptedContactE164("+821012345678")).toBe(true);
    expect(isAcceptedContactE164("09171234567")).toBe(false);
    expect(isAcceptedContactE164("+14155550100")).toBe(false);
  });
});

describe("POST /sync 본문 검증 (§7)", () => {
  const base = { installId: "install-abc-123", sourceId: SOURCE, batchId: "batch-00000001" };
  it("변경분: baseVersion 필수, 같은 번호 1개로", () => {
    const r = parseContactsSyncRequest({
      ...base,
      kind: "delta",
      baseVersion: 3,
      add: [
        { e164: "+639171234567", ref: "a" },
        { e164: "+639171234567", ref: "b" },
      ],
      remove: ["+821012345678"],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.add).toEqual([{ e164: "+639171234567", ref: "b" }]);
      expect(r.value.remove).toEqual(["+821012345678"]);
    }
    expect(parseContactsSyncRequest({ ...base, kind: "delta", add: [] })).toEqual({ ok: false, error: "bad_request" });
  });
  it("스냅숏 조각: 범위·삭제 금지", () => {
    expect(parseContactsSyncRequest({ ...base, kind: "snapshot_chunk", chunkIndex: 0, chunkTotal: 2, add: [] }).ok).toBe(true);
    expect(parseContactsSyncRequest({ ...base, kind: "snapshot_chunk", chunkIndex: 2, chunkTotal: 2 }).ok).toBe(false);
    expect(parseContactsSyncRequest({ ...base, kind: "snapshot_chunk", chunkIndex: 0, chunkTotal: 101 }).ok).toBe(false);
    expect(
      parseContactsSyncRequest({ ...base, kind: "snapshot_chunk", chunkIndex: 0, chunkTotal: 1, remove: ["+639171234567"] }).ok
    ).toBe(false);
  });
  it("원 번호가 E.164 가 아니면 invalid_phone · 한도 초과 too_many · 설치 ID 형식", () => {
    expect(parseContactsSyncRequest({ ...base, kind: "delta", baseVersion: 0, add: [{ e164: "09171234567", ref: "x" }] })).toEqual({
      ok: false,
      error: "invalid_phone",
    });
    const many = Array.from({ length: 101 }, (_, i) => ({ e164: `+63917${String(i).padStart(7, "0")}`, ref: `r${i}` }));
    expect(parseContactsSyncRequest({ ...base, kind: "delta", baseVersion: 0, add: many }, 100)).toEqual({ ok: false, error: "too_many" });
    expect(parseContactsSyncRequest({ ...base, installId: "x", kind: "delta", baseVersion: 0 })).toEqual({
      ok: false,
      error: "invalid_install_id",
    });
    expect(isValidContactsInstallId("6f1c2d3e-aaaa-bbbb-cccc-1234567890ab")).toBe(true);
  });
});

describe("오류 코드 → HTTP 상태", () => {
  it("409·410·429·503", () => {
    expect(contactsErrorStatus("resync_required")).toBe(409);
    expect(contactsErrorStatus("source_inactive")).toBe(410);
    expect(contactsErrorStatus("permission_denied")).toBe(410);
    expect(contactsErrorStatus("daily_limit")).toBe(429);
    expect(contactsErrorStatus("contacts_disabled")).toBe(503);
    expect(contactsErrorStatus("unknown_code")).toBe(500);
  });
});

describe("번호 변환값·설치 값 (원 번호 저장 없음)", () => {
  it("HMAC 은 키에 따라 다르고 같은 입력이면 같다, 32바이트 16진수", () => {
    const key = "k".repeat(32);
    const a = contactsPhoneHmacHex("+639171234567", key);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(contactsPhoneHmacHex("+639171234567", key)).toBe(a);
    expect(contactsPhoneHmacHex("+639171234567", "z".repeat(32))).not.toBe(a);
    expect(a).not.toContain("9171234567");
  });
  it("설치 값은 계정별로 다르다 (다른 계정과 연결 불가)", () => {
    expect(contactsInstallRefHex("user-a", "inst-1")).not.toBe(contactsInstallRefHex("user-b", "inst-1"));
    expect(toByteaParam("ab")).toBe("\\xab");
  });
  it("키가 32자 미만이면 설정 안 됨", () => {
    expect(readContactsPhoneHmacKey({ CONTACTS_PHONE_HMAC_KEY: "short" } as NodeJS.ProcessEnv)).toBeNull();
    expect(readContactsPhoneHmacKey({ CONTACTS_PHONE_HMAC_KEY: "x".repeat(40) } as NodeJS.ProcessEnv)).toBe("x".repeat(40));
  });
});

describe("계정 설정 PATCH 검증", () => {
  it("허용 값만", () => {
    expect(parseContactsSettingsPatch({ discoveryPolicy: "mutual", joinNotifyEnabled: false })).toEqual({
      discoveryPolicy: "mutual",
      joinNotifyEnabled: false,
    });
    expect(parseContactsSettingsPatch({ discoveryPolicy: null })).toEqual({ discoveryPolicy: null });
    expect(parseContactsSettingsPatch({ discoveryPolicy: "friends" })).toBeNull();
    expect(parseContactsSettingsPatch({ callDefault: "phone" })).toEqual({ callDefault: "phone" });
    expect(parseContactsSettingsPatch({})).toBeNull();
  });
});

/** 필수 조건 4: 연락처를 메신저 bootstrap·home-sync·Realtime·방 진입 경로에 연결하지 않는다 */
describe("메신저 hot path 미연결 계약", () => {
  const ROOT = path.resolve(__dirname, "../../../..");
  function walk(dir: string, out: string[]): string[] {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (name === "node_modules" || name === "__tests__") continue;
      const st = statSync(p);
      if (st.isDirectory()) walk(p, out);
      else if (/\.(ts|tsx)$/.test(name)) out.push(p);
    }
    return out;
  }
  it("연락처 모듈을 가져오는 곳은 연락처 API·예약 작업·어드민뿐", () => {
    const files = [
      ...walk(path.join(ROOT, "app"), []),
      ...walk(path.join(ROOT, "components"), []),
      ...walk(path.join(ROOT, "lib"), []),
      ...walk(path.join(ROOT, "hooks"), []),
    ];
    const importers = files
      .filter((f) => readFileSync(f, "utf8").includes("@/lib/community-messenger/contacts/"))
      .map((f) => path.relative(ROOT, f));
    const allowed = [
      /^app\/api\/community-messenger\/contacts\//,
      /^app\/api\/cron\/messenger-contacts-maintenance\//,
      /^app\/api\/admin\/messenger\/contacts(-settings)?\//,
      /^lib\/community-messenger\/contacts\//,
      // 2단계 화면 — 친구 탭 섹션·연락처 화면·설정 진입·친구 추가 시트·메신저 진입 사용 갱신만
      /^components\/community-messenger\/contacts\//,
      /^app\/\(main\)\/community-messenger\/contacts\//,
      /^components\/community-messenger\/MessengerFriendsScreen\.tsx$/,
      /^components\/community-messenger\/MessengerFriendAddSheet\.tsx$/,
      /^components\/community-messenger\/MessengerSettingsScreen\.tsx$/,
      // §13 관리(보관함) 첫 화면 「숨긴 추천」·「연락처 동기화」 줄 — 화면이 보일 때만 API 지연 import (감사 F3)
      /^components\/community-messenger\/MessengerArchiveScreen\.tsx$/,
    ];
    expect(importers.filter((f) => !allowed.some((re) => re.test(f)))).toEqual([]);
  });
  it("bootstrap·home-sync·Realtime·방 경로 파일은 연락처를 가져오지 않는다", () => {
    const hot = [
      ...walk(path.join(ROOT, "lib/community-messenger"), []),
      ...walk(path.join(ROOT, "components/community-messenger"), []),
      ...walk(path.join(ROOT, "app/api/community-messenger"), []),
    ].filter((f) => /(bootstrap|home-sync|realtime|room)/i.test(path.relative(ROOT, f)) && !/contacts/.test(f));
    expect(hot.filter((f) => /contacts\/|MessengerContacts/.test(readFileSync(f, "utf8")))).toEqual([]);
  });
  it("메신저 레이아웃은 사용 갱신 컴포넌트만 (엔진은 지연 import)", () => {
    const layout = readFileSync(path.join(ROOT, "app/(main)/community-messenger/layout.tsx"), "utf8");
    expect(layout).toContain("MessengerContactsHeartbeat");
    const hb = readFileSync(path.join(ROOT, "components/community-messenger/contacts/MessengerContactsHeartbeat.tsx"), "utf8");
    expect(hb).toContain('import("@/lib/community-messenger/contacts/contacts-sync-engine")');
    expect(hb).not.toMatch(/^import .*contacts-sync-engine/m);
  });
});

describe("연락처 화면 1단 머리글 = 연락처 계약 값 (최종 점검 · 중복 값 고정)", () => {
  it("연락처·설정 화면 뒤로 주소가 계약 상수와 같다", async () => {
    const { resolveMainTier1Subpage } = await import("@/lib/layout/resolve-main-tier1");
    const { MESSENGER_CONTACTS_BACK_HREF, MESSENGER_CONTACTS_SCREEN_HREF, MESSENGER_CONTACTS_SETTINGS_HREF } = await import(
      "@/lib/community-messenger/contacts/contacts-contract"
    );
    expect(resolveMainTier1Subpage(MESSENGER_CONTACTS_SCREEN_HREF)?.backHref).toBe(MESSENGER_CONTACTS_BACK_HREF);
    expect(resolveMainTier1Subpage(MESSENGER_CONTACTS_SETTINGS_HREF)?.backHref).toBe(MESSENGER_CONTACTS_SCREEN_HREF);
  });
});
