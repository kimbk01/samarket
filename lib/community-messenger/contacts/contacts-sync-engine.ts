/**
 * 연락처 동기화 엔진 (앱) — SSOT v5 §4 S4·S7·§7·§8.
 * - 매번 찾지 않는다: 기기 안에서 이전 번호표와 비교해 바뀐 것만 올린다. 처음·재설치·409 때만 전체 스냅숏.
 * - 메신저 bootstrap·Realtime·방 진입과 연결하지 않는다. 호출처: 친구 탭 연락처 섹션·연락처 화면·앱 시작 시 하루 1회 사용 갱신(S7).
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
  CONTACTS_REVOKE_PENDING_EVENT,
  clearContactsDeviceData,
  patchContactsLocalState,
  purgeOtherUsersContactsLocalState,
  readContactsLocalState,
  readContactsNames,
  readContactsNumbers,
  shrinkContactsDeviceDataToListed,
  writeContactsNames,
  writeContactsNumbers,
  type ContactsLocalState,
  type ContactsStopReason,
} from "@/lib/community-messenger/contacts/contacts-local-store";

/** 자동(메신저 진입·친구 탭) 비교 간격 — 6시간 */
export const CONTACTS_AUTO_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type ContactsSyncOutcome =
  | "web"
  | "not_consented"
  /** 이 기기는 아직 회원이 올리기를 허락하지 않음 (#11 「이 기기 연락처도 추가할까요?」 전) */
  | "device_not_approved"
  | "permission_needed"
  | "permission_revoked"
  | "throttled"
  | "unchanged"
  | "uploaded"
  | "stopped"
  | "failed";

export type ContactsSyncOptions = {
  /** ⟳ 새로고침 — 6시간 간격 무시 */
  manual?: boolean;
  /** 회원이 이 기기에서 직접 다시 켬(동의·「추가」·권한 허용·이 기기 동기화 켬) — 지운 출처도 재개 (감사 A9) */
  reactivate?: boolean;
};

const inflight = new Map<string, Promise<ContactsSyncOutcome>>();

const manilaDay = contactsManilaDay;

/** 서버 분당 10회 제한(§7) 안에서 전체 업로드를 이어 가기 위한 조각 간격 (조각이 많을 때만) */
const SNAPSHOT_PACE_MS = 6_500;
const SNAPSHOT_PACE_FROM_CHUNKS = 9;

function newBatchId(): string {
  try {
    return `b-${crypto.randomUUID()}`;
  } catch {
    return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 조각 내용 지문 — 연락처가 그대로일 때만 이어 올린다 (바뀌었으면 처음부터) */
function snapshotFingerprint(chunks: { e164: string; ref: string }[][]): string {
  let h = 5381;
  for (const chunk of chunks) {
    for (const x of chunk) {
      const s = `${x.e164}|${x.ref};`;
      for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    }
    h = ((h << 5) + h + 124) | 0;
  }
  return `${chunks.length}:${(h >>> 0).toString(36)}`;
}

const STOP_ERRORS = ["source_inactive", "device_sync_off", "account_sync_off", "consent_required"] as const;
function asStopReason(error: string): ContactsStopReason | null {
  return (STOP_ERRORS as readonly string[]).includes(error) ? (error as ContactsStopReason) : null;
}

/**
 * 멈춤 이유별 기기 안 처리 (§8):
 * - 이 기기 끄기·계정 끄기 = 「기기 안 유지」 → 비교 목록·이름표 그대로 (다시 켜면 바뀐 것만 올림)
 * - 권한 철회·출처 삭제 = 비교 목록 삭제 + 이름표는 목록 회원 것만
 */
function applyStop(userId: string, stop: ContactsStopReason, extra: Partial<ContactsLocalState> = {}): ContactsLocalState {
  const keepDevice = stop === "device_sync_off" || stop === "account_sync_off" || stop === "feature_off";
  if (keepDevice) return patchContactsLocalState(userId, { ...extra, stoppedReason: stop, stoppedDay: manilaDay() });
  shrinkContactsDeviceDataToListed(userId);
  return patchContactsLocalState(userId, { ...extra, stoppedReason: stop, stoppedDay: manilaDay(), snapshotProgress: null });
}

/**
 * 올리기 실패 처리 (감사 A4·A5):
 * - 중지(410): 이유를 기억하고 다음 갱신(또는 회원이 다시 켬)까지 연락처를 읽지도 올리지도 않는다.
 * - 서버가 권한 꺼짐으로 알고 있음: 다음 실행에서 서버 상태를 되돌린다.
 * - 하루 한도(daily_limit·resync_limit): 그 필리핀 날짜에는 다시 시도하지 않는다 (이어 올리기 위치는 남김).
 * - 분당 횟수 제한(contacts_rate_limited): 위치를 남기고 다음 실행에서 이어 올린다.
 */
function handleUploadError(userId: string, r: { error: string; status: number }): ContactsSyncOutcome {
  if (r.error === "permission_denied") {
    writeContactsNumbers(userId, null);
    patchContactsLocalState(userId, { serverPermissionDenied: true, snapshotProgress: null });
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
    applyStop(userId, stop);
    return "stopped";
  }
  if (r.error === "daily_limit" || r.error === "resync_limit") {
    patchContactsLocalState(userId, { limitDay: manilaDay() });
    return "throttled";
  }
  if (r.status === 429) return "throttled";
  return "failed";
}

async function registerSource(userId: string, state: ContactsLocalState, reactivate: boolean): Promise<ContactsLocalState | null> {
  const platform = contactsNativePlatform();
  if (!platform) return null;
  const r = await contactsApi.registerSource(ensureClientInstanceId(), platform, reactivate);
  if (!r.ok) {
    if (r.error === "consent_required") {
      // 다른 기기에서 동의 철회 → 이 기기 안 번호·이름 삭제 (최종 점검 N5)
      clearContactsDeviceData(userId);
      patchContactsLocalState(userId, { consented: false });
    } else if (r.error === "contacts_disabled") {
      // 어드민 킬스위치 꺼짐 → 그날은 메신저에 들어올 때마다 다시 묻지 않는다 (최종 점검 N6)
      applyStop(userId, "feature_off", { lastHeartbeatDay: manilaDay() });
    }
    return null;
  }
  const src = r.data.source;
  if (src.removed === true) {
    // 회원이 지운 출처 → 이 기기에서 다시 켤 때까지 멈춤 (하루 1회 갱신으로 되살리지 않음 — 감사 A9)
    return applyStop(userId, "source_removed", { sourceId: src.source_id, lastHeartbeatDay: manilaDay() });
  }
  const reactivated = src.reactivated === true || src.source_id !== state.sourceId;
  // 서버가 알려준 이 기기·계정 상태로 중지 여부를 다시 정한다 (하루 1회)
  const stoppedReason: ContactsStopReason | null =
    src.account_sync_enabled === false ? "account_sync_off" : src.sync_enabled === false ? "device_sync_off" : null;
  // 새 출처·재사용 재개면 이전 번호표는 서버와 맞지 않으므로 전체 스냅숏
  if (reactivated && state.numbersCount !== null) writeContactsNumbers(userId, null);
  return patchContactsLocalState(userId, {
    sourceId: src.source_id,
    deviceVersion: Number(src.device_version),
    lastHeartbeatDay: manilaDay(),
    snapshotProgress: reactivated ? null : state.snapshotProgress,
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

/**
 * 전체 업로드 (조각) — 끊기면 다음 실행에서 이어 올린다 (감사 #1):
 * 조각 크기·개수·내용이 같으면 서버 미확정 세대에 남은 조각만 보낸다. 조각이 많으면 분당 제한 안에서 간격을 둔다.
 */
async function uploadSnapshot(
  userId: string,
  state: ContactsLocalState,
  numbers: Record<string, string>,
  allowRestart = true
): Promise<ContactsSyncOutcome> {
  const installId = ensureClientInstanceId();
  const size = chunkSizeOf(state);
  const chunks = chunkContactsForSnapshot(numbers, size);
  const fingerprint = snapshotFingerprint(chunks);
  const prev = state.snapshotProgress;
  const resume =
    prev && prev.size === size && prev.total === chunks.length && prev.fingerprint === fingerprint && prev.nextChunk > 0 && prev.nextChunk < chunks.length
      ? prev
      : null;
  let generation: number | null = resume ? resume.generation : null;
  let last: { device_version: number } | null = null;
  const paced = chunks.length >= SNAPSHOT_PACE_FROM_CHUNKS;
  for (let i = resume ? resume.nextChunk : 0; i < chunks.length; i += 1) {
    if (paced && i > (resume ? resume.nextChunk : 0)) await sleep(SNAPSHOT_PACE_MS);
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
    if (!r.ok) {
      if (r.error === "snapshot_generation_mismatch") {
        // 서버의 미확정 세대가 정리됨(3일 이상 멈춤 등) → 처음부터 1번만 다시
        patchContactsLocalState(userId, { snapshotProgress: null });
        if (resume && allowRestart) return uploadSnapshot(userId, { ...state, snapshotProgress: null }, numbers, false);
        return "failed";
      }
      return handleUploadError(userId, r);
    }
    generation = Number(r.data.generation);
    last = r.data;
    if (i < chunks.length - 1) {
      patchContactsLocalState(userId, { snapshotProgress: { generation, nextChunk: i + 1, total: chunks.length, size, fingerprint } });
    }
  }
  writeContactsNumbers(userId, numbers);
  patchContactsLocalState(userId, {
    deviceVersion: last ? Number(last.device_version) : state.deviceVersion,
    lastSyncAt: Date.now(),
    snapshotProgress: null,
  });
  return "uploaded";
}

async function runSync(userId: string, opts: ContactsSyncOptions): Promise<ContactsSyncOutcome> {
  purgeOtherUsersContactsLocalState(userId);
  if (!isContactsNativeAvailable()) return "web";
  let state = readContactsLocalState(userId);
  if (!state.consented) return "not_consented";
  // 이 기기에서 허락하기 전에는 읽지도 올리지도 않는다 (#11) — 예전에 올린 기기(sourceId 있음)는 허락한 것으로 본다
  if (!state.deviceApproved && !state.sourceId && !opts.reactivate) return "device_not_approved";
  if (opts.reactivate && !state.deviceApproved) state = patchContactsLocalState(userId, { deviceApproved: true });

  const now = Date.now();
  const today = manilaDay(now);
  const permission = await checkContactsPermission();
  const allowed = permission === "granted" || permission === "limited";
  // OS 설정에서 권한을 다시 켠 것 = 회원이 직접 다시 켬 → 지운 출처도 재개
  const regranted = allowed && state.lastPermission !== null && state.lastPermission !== "granted" && state.lastPermission !== "limited";
  const reactivate = opts.reactivate === true || regranted;
  // 하루 1회 기기 사용 갱신 (§7·S7) — 권한이 꺼져도 「유지」한 기기는 사용 중으로 갱신 (§8·#10, 180일 정리 대상 아님).
  // 회원이 직접 다시 켰으면 같은 날이라도 바로 다시 등록(재개)한다 — 「다시 켜기」가 그날 바로 동작 (재점검 #1)
  const heartbeatDue = !state.sourceId || state.lastHeartbeatDay !== today || reactivate;
  if (heartbeatDue && (allowed || state.sourceId)) {
    const registered = await registerSource(userId, state, reactivate && allowed);
    if (!registered) {
      const after = readContactsLocalState(userId);
      return !after.consented ? "not_consented" : after.stoppedReason === "feature_off" ? "stopped" : "failed";
    }
    state = registered;
  }

  if (!allowed) {
    // 허용했던 기기가 꺼짐 → 서버에 알림(업로드 중단) + 삭제 안내 (#19). 알림 실패면 다음 실행에서 다시.
    if (
      state.sourceId &&
      state.stoppedReason !== "source_removed" &&
      !state.serverPermissionDenied &&
      (state.lastPermission === "granted" || state.lastPermission === "limited")
    ) {
      const r = await contactsApi.patchSource(state.sourceId, { installId: ensureClientInstanceId(), permissionState: "denied" });
      if (!r.ok) return "failed";
      shrinkContactsDeviceDataToListed(userId);
      patchContactsLocalState(userId, {
        lastPermission: permission,
        revokePending: true,
        revokeCount: state.numbersCount ?? 0,
        snapshotProgress: null,
        serverPermissionDenied: true,
      });
      notifyContactsRevokePending();
      return "permission_revoked";
    }
    // 값이 바뀔 때만 쓴다 (매 진입 전체 JSON 다시 쓰기 금지 — 최종 점검 #9)
    if (state.lastPermission !== permission) patchContactsLocalState(userId, { lastPermission: permission });
    return state.revokePending ? "permission_revoked" : "permission_needed";
  }

  // 다시 허용 → 서버가 꺼짐으로 알고 있으면 되돌림 (Android 는 철회 뒤 prompt 로 보고하므로 이전 값과 무관하게 서버 표시로 판정 — 감사 A4)
  if (state.serverPermissionDenied && state.sourceId && state.stoppedReason !== "source_removed") {
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

  // 끊긴 전체 업로드가 있으면 6시간 간격과 무관하게 이어 올린다
  if (!opts.manual && !state.snapshotProgress && state.numbersCount !== null && state.lastSyncAt && now - state.lastSyncAt < CONTACTS_AUTO_SYNC_INTERVAL_MS) {
    return "throttled";
  }

  const contacts = await readPhoneContacts();
  const { numbers, names } = buildContactsNumberMap(contacts, state.defaultCountry);
  // 큰 값(번호표·이름표)은 실제로 연락처를 읽을 때만 읽는다 (최대 6시간에 1번·수동 새로고침)
  if (JSON.stringify(names) !== JSON.stringify(readContactsNames(userId))) state = writeContactsNames(userId, names);

  // 끊긴 전체 업로드가 있으면 변경분보다 먼저 이어 올린다 (서버가 미확정 세대를 들고 있어 변경분은 409 — 재점검 #4)
  const prevNumbers = state.snapshotProgress ? null : readContactsNumbers(userId);
  if (!prevNumbers || state.snapshotProgress) return uploadSnapshot(userId, state, numbers);

  const diff = diffContactsNumberMaps(prevNumbers, numbers);
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
    writeContactsNumbers(userId, numbers);
    patchContactsLocalState(userId, { deviceVersion: Number(r.data.device_version), lastSyncAt: now });
    return "uploaded";
  }
  if (r.status === 409) {
    // 늦은 업로드·순서 어긋남 → 지금 연락처로 전체 다시 맞춤 (내 기기 데이터만 바뀜)
    const fresh = patchContactsLocalState(userId, {
      deviceVersion: typeof r.body?.deviceVersion === "number" ? (r.body.deviceVersion as number) : state.deviceVersion,
      snapshotProgress: null,
    });
    return uploadSnapshot(userId, fresh, numbers);
  }
  return handleUploadError(userId, r);
}

/** 권한 철회 안내가 새로 생겼음을 앱 전체 안내(메인 레이아웃)에 알림 (#19 「다음 실행 때 다시 안내」) */
function notifyContactsRevokePending(): void {
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(CONTACTS_REVOKE_PENDING_EVENT));
  } catch {
    /* ignore */
  }
}

/** 연락처 동기화 1회 (회원별 동시 1개) */
export function runContactsSync(userId: string, opts: ContactsSyncOptions = {}): Promise<ContactsSyncOutcome> {
  const key = userId;
  const existing = inflight.get(key);
  // 자동 실행 중에 회원이 직접 켜면(재개) 끝난 뒤 그 요청으로 한 번 더 — 회원 동작을 버리지 않는다
  if (existing) return opts.reactivate ? existing.then(() => runContactsSync(userId, opts)) : existing;
  const p = runSync(userId, { manual: opts.manual === true, reactivate: opts.reactivate === true })
    .catch(() => "failed" as const)
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
