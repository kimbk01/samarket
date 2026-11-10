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
import {
  patchContactsLocalState,
  purgeOtherUsersContactsLocalState,
  readContactsLocalState,
  type ContactsLocalState,
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

function manilaDay(now = Date.now()): string {
  return new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
}

function newBatchId(): string {
  try {
    return `b-${crypto.randomUUID()}`;
  } catch {
    return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

/** 410(중지·삭제·철회) 이면 이 기기 상태만 비운다 */
function isStopError(error: string): boolean {
  return ["source_inactive", "device_sync_off", "permission_denied", "account_sync_off", "consent_required"].includes(error);
}

async function registerSource(userId: string, state: ContactsLocalState): Promise<ContactsLocalState | null> {
  const platform = contactsNativePlatform();
  if (!platform) return null;
  const r = await contactsApi.registerSource(ensureClientInstanceId(), platform);
  if (!r.ok) {
    if (r.error === "consent_required") patchContactsLocalState(userId, { consented: false });
    return null;
  }
  const src = r.data.source;
  const reactivated = src.reactivated === true || src.source_id !== state.sourceId;
  return patchContactsLocalState(userId, {
    sourceId: src.source_id,
    deviceVersion: Number(src.device_version),
    lastHeartbeatDay: manilaDay(),
    // 새 출처·재사용 재개면 이전 번호표는 서버와 맞지 않으므로 전체 스냅숏
    numbers: reactivated ? null : state.numbers,
  });
}

async function uploadSnapshot(userId: string, state: ContactsLocalState, numbers: Record<string, string>): Promise<ContactsSyncOutcome> {
  const installId = ensureClientInstanceId();
  const chunks = chunkContactsForSnapshot(numbers);
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
    if (!r.ok) {
      if (isStopError(r.error)) {
        patchContactsLocalState(userId, { numbers: null });
        return "stopped";
      }
      return "failed";
    }
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

  const permission = await checkContactsPermission();
  if (permission === "denied" || permission === "prompt") {
    // 허용했던 기기가 꺼짐 → 업로드 중단 + 삭제 안내 (#19)
    if ((state.lastPermission === "granted" || state.lastPermission === "limited") && state.sourceId) {
      await contactsApi.patchSource(state.sourceId, { installId: ensureClientInstanceId(), permissionState: "denied" });
      patchContactsLocalState(userId, { lastPermission: permission, revokePending: true, numbers: null });
      return "permission_revoked";
    }
    patchContactsLocalState(userId, { lastPermission: permission });
    return state.revokePending ? "permission_revoked" : "permission_needed";
  }
  if (state.lastPermission === "denied" && state.sourceId) {
    // 다시 허용 → 서버 상태도 되돌림 (철회 답 비움)
    await contactsApi.patchSource(state.sourceId, { installId: ensureClientInstanceId(), permissionState: permission });
  }
  state = patchContactsLocalState(userId, { lastPermission: permission, revokePending: false });

  const now = Date.now();
  const heartbeatDue = !state.sourceId || state.lastHeartbeatDay !== manilaDay(now);
  if (heartbeatDue) {
    const registered = await registerSource(userId, state);
    if (!registered) return "failed";
    state = registered;
  }
  if (!opts.manual && state.numbers && state.lastSyncAt && now - state.lastSyncAt < CONTACTS_AUTO_SYNC_INTERVAL_MS) {
    return "throttled";
  }

  const contacts = await readPhoneContacts();
  const { numbers, names } = buildContactsNumberMap(contacts, state.defaultCountry);
  patchContactsLocalState(userId, { names });

  if (!state.numbers) return uploadSnapshot(userId, state, numbers);

  const diff = diffContactsNumberMaps(state.numbers, numbers);
  if (diff.add.length === 0 && diff.remove.length === 0) {
    patchContactsLocalState(userId, { lastSyncAt: now });
    return "unchanged";
  }
  if (diff.add.length + diff.remove.length > 1000) return uploadSnapshot(userId, state, numbers);
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
  if (isStopError(r.error)) {
    patchContactsLocalState(userId, { numbers: null });
    return "stopped";
  }
  return "failed";
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
