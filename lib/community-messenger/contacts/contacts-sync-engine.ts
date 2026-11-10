/**
 * 연락처 동기화 엔진 (앱) — SSOT v5 §4 S4·S7·§7·§8.
 * - 매번 찾지 않는다: 기기 안에서 이전 번호표와 비교해 바뀐 것만 올린다. 처음·재설치·409 때만 전체 스냅숏.
 * - 메신저 bootstrap·Realtime·방 진입과 연결하지 않는다. 호출처: 친구 탭 연락처 섹션·연락처 화면·메신저 진입 시 하루 1회 사용 갱신.
 * - 동시에 두 번 돌지 않게 회원별 1개만 (single-flight).
 */
import { ensureClientInstanceId } from "@/lib/auth/client-instance-id";
import { contactsApi } from "@/lib/community-messenger/contacts/contacts-api-client";
import {
  buildContactsNumberMap,
  chunkContactsForSnapshot,
  diffContactsNumberMaps,
} from "@/lib/community-messenger/contacts/contacts-diff";
import {
  checkContactsPermission,
  contactsNativePlatform,
  isContactsNativeAvailable,
  readPhoneContacts,
} from "@/lib/community-messenger/contacts/contacts-native";
import { contactsManilaDay } from "@/lib/community-messenger/contacts/contacts-contract";
import {
  clearContactsDeviceData,
  namesForListedMembers,
  patchContactsLocalState,
  purgeOtherUsersContactsLocalState,
  readContactsLocalState,
  type ContactsLocalState,
  type ContactsStopReason,
} from "@/lib/community-messenger/contacts/contacts-local-store";

/** 자동(메신저 진입·친구 탭) 비교 간격 — 6시간 */
export const CONTACTS_AUTO_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type ContactsSyncOutcome =
  | "web"
  | "not_consented"
  | "permission_needed"
  | "permission_revoked"
  | "throttled"
  | "unchanged"
  | "uploaded"
  | "stopped"
  | "failed";

const inflight = new Map<string, Promise<ContactsSyncOutcome>>();

const manilaDay = contactsManilaDay;

function newBatchId(): string {
  try {
    return `b-${crypto.randomUUID()}`;
  } catch {
    return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

const STOP_ERRORS = ["source_inactive", "device_sync_off", "account_sync_off", "consent_required"] as const;
function asStopReason(error: string): ContactsStopReason | null {
  return (STOP_ERRORS as readonly string[]).includes(error) ? (error as ContactsStopReason) : null;
}
/** 하루 한도·횟수 제한 — 그날은 다시 올리지 않는다 */
function isLimitError(r: { error: string; status: number }): boolean {
  return r.error === "daily_limit" || r.error === "resync_limit" || r.status === 429;
}

/**
 * 올리기 실패 처리 (감사 A4·A5):
 * - 중지(410): 이유를 기억하고 다음 갱신 때까지 연락처를 읽지도 올리지도 않는다.
 * - 서버가 권한 꺼짐으로 알고 있음: 다음 실행에서 서버 상태를 되돌린다.
 * - 한도(429): 그 필리핀 날짜에는 다시 시도하지 않는다.
 */
function handleUploadError(userId: string, r: { error: string; status: number }): ContactsSyncOutcome {
  const today = manilaDay();
  if (r.error === "permission_denied") {
    patchContactsLocalState(userId, { serverPermissionDenied: true, numbers: null });
    return "failed";
  }
  const stop = asStopReason(r.error);
  if (stop === "consent_required") {
    // 다른 기기에서 동의 철회 → 이 기기 안 번호·이름도 지운다 (§8 「동의 철회 · 기기 안 삭제」 — 최종 점검 N5)
    clearContactsDeviceData(userId);
    patchContactsLocalState(userId, { consented: false });
    return "not_consented";
  }
  if (stop) {
    const cur = readContactsLocalState(userId);
    patchContactsLocalState(userId, { numbers: null, names: namesForListedMembers(cur), stoppedReason: stop, stoppedDay: today });
    return "stopped";
  }
  if (isLimitError(r)) {
    patchContactsLocalState(userId, { limitDay: today });
    return "throttled";
  }
  return "failed";
}

async function registerSource(userId: string, state: ContactsLocalState): Promise<ContactsLocalState | null> {
  const platform = contactsNativePlatform();
  if (!platform) return null;
  const r = await contactsApi.registerSource(ensureClientInstanceId(), platform);
  if (!r.ok) {
    if (r.error === "consent_required") {
      // 다른 기기에서 동의 철회 → 이 기기 안 번호·이름 삭제 (최종 점검 N5)
      clearContactsDeviceData(userId);
      patchContactsLocalState(userId, { consented: false });
    } else if (r.error === "contacts_disabled") {
      // 어드민 킬스위치 꺼짐 → 그날은 메신저에 들어올 때마다 다시 묻지 않는다 (최종 점검 N6)
      patchContactsLocalState(userId, { lastHeartbeatDay: manilaDay(), stoppedReason: "feature_off", stoppedDay: manilaDay() });
    }
    return null;
  }
  const src = r.data.source;
  const reactivated = src.reactivated === true || src.source_id !== state.sourceId;
  // 서버가 알려준 이 기기·계정 상태로 중지 여부를 다시 정한다 (하루 1회)
  const stoppedReason: ContactsStopReason | null =
    src.account_sync_enabled === false ? "account_sync_off" : src.sync_enabled === false ? "device_sync_off" : null;
  return patchContactsLocalState(userId, {
    sourceId: src.source_id,
    deviceVersion: Number(src.device_version),
    lastHeartbeatDay: manilaDay(),
    // 새 출처·재사용 재개면 이전 번호표는 서버와 맞지 않으므로 전체 스냅숏
    numbers: reactivated ? null : state.numbers,
    stoppedReason,
    stoppedDay: stoppedReason ? manilaDay() : null,
    serverPermissionDenied: src.permission_state === "denied",
    requestNumberLimit: typeof r.data.requestNumberLimit === "number" ? r.data.requestNumberLimit : state.requestNumberLimit,
  });
}

function chunkSizeOf(state: ContactsLocalState): number {
  const n = state.requestNumberLimit;
  return typeof n === "number" && n >= 1 && n <= 1000 ? Math.floor(n) : 1000;
}

async function uploadSnapshot(userId: string, state: ContactsLocalState, numbers: Record<string, string>): Promise<ContactsSyncOutcome> {
  const installId = ensureClientInstanceId();
  const chunks = chunkContactsForSnapshot(numbers, chunkSizeOf(state));
  let generation: number | null = null;
  let last: { device_version: number } | null = null;
  for (let i = 0; i < chunks.length; i += 1) {
    const body = {
      installId,
      sourceId: state.sourceId,
      batchId: newBatchId(),
      kind: "snapshot_chunk",
      add: chunks[i],
      generation,
      chunkIndex: i,
      chunkTotal: chunks.length,
    };
    let r = await contactsApi.sync(body);
    if (!r.ok && r.status === 0) r = await contactsApi.sync(body); // 같은 batchId 로 1회 재시도 (서버가 중복 판정)
    if (!r.ok) return handleUploadError(userId, r);
    generation = Number(r.data.generation);
    last = r.data;
  }
  patchContactsLocalState(userId, { numbers, deviceVersion: last ? Number(last.device_version) : state.deviceVersion, lastSyncAt: Date.now() });
  return "uploaded";
}

async function runSync(userId: string, opts: { manual: boolean }): Promise<ContactsSyncOutcome> {
  purgeOtherUsersContactsLocalState(userId);
  if (!isContactsNativeAvailable()) return "web";
  let state = readContactsLocalState(userId);
  if (!state.consented) return "not_consented";

  const now = Date.now();
  const today = manilaDay(now);
  const permission = await checkContactsPermission();
  const allowed = permission === "granted" || permission === "limited";

  // 하루 1회 기기 사용 갱신 (§7·S7) — 권한이 꺼져도 「유지」한 기기는 사용 중으로 갱신 (§8·#10, 180일 정리 대상 아님)
  const heartbeatDue = !state.sourceId || state.lastHeartbeatDay !== today;
  if (heartbeatDue && (allowed || state.sourceId)) {
    const registered = await registerSource(userId, state);
    if (!registered) {
      const after = readContactsLocalState(userId);
      return !after.consented ? "not_consented" : after.stoppedReason === "feature_off" ? "stopped" : "failed";
    }
    state = registered;
  }

  if (!allowed) {
    // 허용했던 기기가 꺼짐 → 서버에 알림(업로드 중단) + 삭제 안내 (#19). 알림 실패면 다음 실행에서 다시.
    if (state.sourceId && !state.serverPermissionDenied && (state.lastPermission === "granted" || state.lastPermission === "limited")) {
      const r = await contactsApi.patchSource(state.sourceId, { installId: ensureClientInstanceId(), permissionState: "denied" });
      if (!r.ok) return "failed";
      patchContactsLocalState(userId, {
        lastPermission: permission,
        revokePending: true,
        revokeCount: state.numbers ? Object.keys(state.numbers).length : 0,
        numbers: null,
        names: namesForListedMembers(state),
        serverPermissionDenied: true,
      });
      return "permission_revoked";
    }
    // 값이 바뀔 때만 쓴다 (매 진입 전체 JSON 다시 쓰기 금지 — 최종 점검 #9)
    if (state.lastPermission !== permission) patchContactsLocalState(userId, { lastPermission: permission });
    return state.revokePending ? "permission_revoked" : "permission_needed";
  }

  // 다시 허용 → 서버가 꺼짐으로 알고 있으면 되돌림 (Android 는 철회 뒤 prompt 로 보고하므로 이전 값과 무관하게 서버 표시로 판정 — 감사 A4)
  if (state.serverPermissionDenied && state.sourceId) {
    const r = await contactsApi.patchSource(state.sourceId, { installId: ensureClientInstanceId(), permissionState: permission });
    if (!r.ok) return "failed";
    state = patchContactsLocalState(userId, { serverPermissionDenied: false });
  }
  if (state.lastPermission !== permission || state.revokePending) {
    state = patchContactsLocalState(userId, { lastPermission: permission, revokePending: false });
  }

  // 서버 중지·하루 한도 — 연락처를 읽지도 올리지도 않는다 (감사 A5)
  if (state.stoppedReason) return "stopped";
  if (state.limitDay === today) return "throttled";

  if (!opts.manual && state.numbers && state.lastSyncAt && now - state.lastSyncAt < CONTACTS_AUTO_SYNC_INTERVAL_MS) {
    return "throttled";
  }

  const contacts = await readPhoneContacts();
  const { numbers, names } = buildContactsNumberMap(contacts, state.defaultCountry);
  if (JSON.stringify(names) !== JSON.stringify(state.names)) patchContactsLocalState(userId, { names });

  if (!state.numbers) return uploadSnapshot(userId, state, numbers);

  const diff = diffContactsNumberMaps(state.numbers, numbers);
  if (diff.add.length === 0 && diff.remove.length === 0) {
    patchContactsLocalState(userId, { lastSyncAt: now });
    return "unchanged";
  }
  if (diff.add.length + diff.remove.length > chunkSizeOf(state)) return uploadSnapshot(userId, state, numbers);
  const body = {
    installId: ensureClientInstanceId(),
    sourceId: state.sourceId,
    batchId: newBatchId(),
    kind: "delta",
    baseVersion: state.deviceVersion ?? 0,
    add: diff.add,
    remove: diff.remove,
  };
  let r = await contactsApi.sync(body);
  if (!r.ok && r.status === 0) r = await contactsApi.sync(body);
  if (r.ok) {
    patchContactsLocalState(userId, { numbers, deviceVersion: Number(r.data.device_version), lastSyncAt: now });
    return "uploaded";
  }
  if (r.status === 409) {
    // 늦은 업로드·순서 어긋남 → 지금 연락처로 전체 다시 맞춤 (내 기기 데이터만 바뀜)
    const fresh = patchContactsLocalState(userId, {
      deviceVersion: typeof r.body?.deviceVersion === "number" ? (r.body.deviceVersion as number) : state.deviceVersion,
    });
    return uploadSnapshot(userId, fresh, numbers);
  }
  return handleUploadError(userId, r);
}

/** 연락처 동기화 1회 (회원별 동시 1개) */
export function runContactsSync(userId: string, opts: { manual?: boolean } = {}): Promise<ContactsSyncOutcome> {
  const key = userId;
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = runSync(userId, { manual: opts.manual === true })
    .catch(() => "failed" as const)
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
