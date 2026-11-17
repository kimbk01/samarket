/**
 * 지난 실행 값 사진 (앱 진입 실기 F3-a · docs/audit/app-entry-device-fail-root-cause-design-2026-11-17.md §3).
 *
 * 성공 조회 뒤 기기(localStorage 키 1개 · JSON · 버전)에 회원 여부·주소 한 줄·사진 주소·알림 종/telRING 숫자를 남기고,
 * 다음 실행의 첫 클라이언트 그림(hydration 직후 layout effect)에서 그 값을 먼저 보인다. 새 조회가 오면 그 값으로 바뀐다.
 *
 * CONTRACT
 * - 표시 씨앗(seed)일 뿐 권한(authority)이 아니다 — 배지·회원 store 에 넣지 않고 화면에서만 「진짜 값이 오기 전」에 쓴다.
 * - 계정 묶음: 쓰기·읽기 모두 Supabase 로그인 쿠키의 사용자 id(`readLifecycleAccountKey`)와 같을 때만.
 *   쿠키가 없거나(guest) 다른 계정이면 읽지 않는다 — 다른 계정의 값을 절대 보이지 않는다.
 * - 렌더 중에 읽지 않는다(서버 HTML·hydration 첫 렌더 동일). 읽기는 `useLastRunSnapshot`(layout effect) 만.
 * - 로그아웃·계정 전환 = `clearLastRunSnapshot` (client-session-wipe).
 *
 * 기존 저장소를 넓히지 않은 이유: `dibay:startup:user`(startup-cache)는 「배지 등 데이터 권한은 넣지 않는다」는 셸 캐시이고
 * 계정 확인 없이 로컬 셸이 읽는다. 주소 캐시(`peekFreshAddressDefaultsSnapshot`)는 메모리 TTL 이라 앱을 다시 켜면 비어 있다.
 */

import { STARTUP_CACHE_KEYS } from "@/lib/startup/startup-constants";
import { RESTORE_ACCOUNT_GUEST, readLifecycleAccountKey } from "@/lib/lifecycle/restore-envelope";

export const LAST_RUN_SNAPSHOT_KEY = STARTUP_CACHE_KEYS.lastRun;
export const LAST_RUN_SNAPSHOT_VERSION = 1;

const ADDRESS_LINE_MAX = 160;
const AVATAR_URL_MAX = 1024;

export type LastRunSnapshot = {
  v: typeof LAST_RUN_SNAPSHOT_VERSION;
  /** Supabase auth user id (로그인 쿠키) */
  account: string;
  writtenAt: number;
  /** 회원 확정 여부 */
  member?: boolean;
  /** 홈 머리줄 대표 주소 한 줄 (null = 주소 없음) */
  addressLine?: string | null;
  /** 프로필 사진 주소 (null = 사진 없음) */
  avatarUrl?: string | null;
  /** 알림 종 숫자 */
  bellUnread?: number;
  /** telRING(하단 채팅 탭) 숫자 */
  telringUnread?: number;
};

export type LastRunSnapshotPatch = Partial<
  Pick<LastRunSnapshot, "member" | "addressLine" | "avatarUrl" | "bellUnread" | "telringUnread">
>;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function count(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return Math.max(0, Math.floor(v));
}

function textOrNull(v: unknown, max: number): string | null | undefined {
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

/** 저장 JSON → 사진. 버전·모양이 다르면 null. */
export function parseLastRunSnapshot(raw: string | null): LastRunSnapshot | null {
  if (!raw) return null;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  if (r.v !== LAST_RUN_SNAPSHOT_VERSION) return null;
  const account = typeof r.account === "string" ? r.account.trim() : "";
  if (!account || account === RESTORE_ACCOUNT_GUEST) return null;
  const snap: LastRunSnapshot = {
    v: LAST_RUN_SNAPSHOT_VERSION,
    account,
    writtenAt: typeof r.writtenAt === "number" && Number.isFinite(r.writtenAt) ? r.writtenAt : 0,
  };
  if (typeof r.member === "boolean") snap.member = r.member;
  const addressLine = textOrNull(r.addressLine, ADDRESS_LINE_MAX);
  if (addressLine !== undefined) snap.addressLine = addressLine;
  const avatarUrl = textOrNull(r.avatarUrl, AVATAR_URL_MAX);
  if (avatarUrl !== undefined) snap.avatarUrl = avatarUrl;
  const bell = count(r.bellUnread);
  if (bell !== undefined) snap.bellUnread = bell;
  const telring = count(r.telringUnread);
  if (telring !== undefined) snap.telringUnread = telring;
  return snap;
}

function readRaw(): LastRunSnapshot | null {
  const s = storage();
  if (!s) return null;
  try {
    return parseLastRunSnapshot(s.getItem(LAST_RUN_SNAPSHOT_KEY));
  } catch {
    return null;
  }
}

/** 지금 로그인 쿠키 계정의 사진만. 쿠키 없음·다른 계정·버전 다름 = null. 브라우저 전용. */
export function readLastRunSnapshotForCurrentAccount(): LastRunSnapshot | null {
  const account = readLifecycleAccountKey();
  if (!account || account === RESTORE_ACCOUNT_GUEST) return null;
  const snap = readRaw();
  if (!snap || snap.account !== account) return null;
  return snap;
}

function samePatchValues(base: LastRunSnapshot, patch: LastRunSnapshotPatch): boolean {
  return (Object.keys(patch) as (keyof LastRunSnapshotPatch)[]).every((k) => base[k] === patch[k]);
}

/**
 * 성공 조회 뒤 값 기록 — 지금 쿠키 계정에 묶는다. `confirmedUserId`(조회가 확인한 사용자)가 쿠키 계정과 다르면 쓰지 않는다.
 * 저장된 사진이 다른 계정이면 버리고 새로 시작한다. 같은 값이면 쓰지 않는다.
 */
export function updateLastRunSnapshot(patch: LastRunSnapshotPatch, confirmedUserId?: string | null): void {
  const s = storage();
  if (!s) return;
  const account = readLifecycleAccountKey();
  if (!account || account === RESTORE_ACCOUNT_GUEST) return;
  const confirmed = String(confirmedUserId ?? "").trim();
  if (confirmed && confirmed !== account) return;
  const clean: LastRunSnapshotPatch = {};
  if (patch.member !== undefined) clean.member = patch.member === true;
  if (patch.addressLine !== undefined) clean.addressLine = textOrNull(patch.addressLine, ADDRESS_LINE_MAX) ?? null;
  if (patch.avatarUrl !== undefined) clean.avatarUrl = textOrNull(patch.avatarUrl, AVATAR_URL_MAX) ?? null;
  if (patch.bellUnread !== undefined) clean.bellUnread = count(patch.bellUnread) ?? 0;
  if (patch.telringUnread !== undefined) clean.telringUnread = count(patch.telringUnread) ?? 0;
  const prev = readRaw();
  const base: LastRunSnapshot =
    prev && prev.account === account ? prev : { v: LAST_RUN_SNAPSHOT_VERSION, account, writtenAt: 0 };
  if (prev && prev.account === account && samePatchValues(base, clean)) return;
  const next: LastRunSnapshot = { ...base, ...clean, v: LAST_RUN_SNAPSHOT_VERSION, account, writtenAt: Date.now() };
  try {
    s.setItem(LAST_RUN_SNAPSHOT_KEY, JSON.stringify(next));
  } catch {
    /* quota · private mode */
  }
}

/** 로그아웃·계정 전환 — client-session-wipe 에서 호출. */
export function clearLastRunSnapshot(): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(LAST_RUN_SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
}
