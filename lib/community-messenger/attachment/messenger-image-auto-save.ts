"use client";

/**
 * 메신저 '미디어 자동 저장' — 설정 ON 일 때만, 받은 사진(내가 보낸 것 제외)을 기기 사진첩에 원본으로 저장.
 *
 * 중복·재조회·재실행 안전:
 * - 기준 시각(enabledAt, **계정별**): 이 계정에서 ON 을 처음 관측한 시각. 이전 메시지는 저장하지 않는다
 *   (켜는 순간 과거 사진 전체가 저장되는 것 방지).
 *   설정 값은 토글뿐 아니라 백업 가져오기(`writeCommunityMessengerLocalSettings`)로도 바뀌므로, 토글 핸들러에
 *   의존하지 않고 설정 변경 이벤트·storage 이벤트·모듈 로드 시점에 OFF / OFF→ON 전환을 관측해 기준을 지운다
 *   (다음 자동 저장 호출이 "지금"으로 새 기준을 잡는다). 구버전 전역 키는 무시·삭제(묵은 기준 → 과거 사진 대량 저장 방지).
 * - 처리 원장(localStorage, 계정별): **저장 성공(일부 성공 포함)** 또는 최종 포기한 메시지 id — 방 재진입·재조회·
 *   앱 재실행 시 재저장하지 않는다. 전체 실패는 일정 시간 뒤 1회만 재시도(상한, 루프 없음).
 * - 권한 거부: 같은 ON 구간에서는 재시도하지 않는다(설정을 껐다 켜면 다시 시도).
 * - 구버전 앱(저장 미지원)·일반 웹 브라우저: 자동 저장하지 않는다(사진첩 없음/브라우저 다운로드 폭주 방지).
 * - 범위: **앱 포그라운드 전역** — `use-messenger-image-auto-save-global` 이 (1) Realtime 버스
 *   `cm.room.incoming_message` 행, (2) 참여자 unread 증가 신호(`cm.room.bump`) 후 catch-up,
 *   (3) 포그라운드 복귀·마운트 catch-up(`GET /api/community-messenger/media/auto-save-candidates`)을
 *   모두 이 함수로 보낸다. 원장·inflight 가 출처 간 중복 저장을 막는다. 백그라운드(앱 비활성) 저장은 없다.
 * - 권한: 설정을 켤 때 권한을 미리 요청하지 않는다(네이티브는 저장 시점에만 add-only 를 요청) —
 *   첫 자동 저장 때 OS 팝업이 1회 뜬다.
 */
import {
  messengerImageOriginalUrls,
  messengerImageSaveNotice,
  resolveMessengerImageSaveMode,
  saveMessengerImages,
  type MessengerImageSaveNotice,
} from "@/lib/community-messenger/attachment/messenger-image-save";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { COMMUNITY_MESSENGER_PREFERENCE_EVENT } from "@/lib/community-messenger/preferences";

/** 구버전(계정 공용) 기준 키 — 읽지 않고 삭제만 한다. */
const LEGACY_ENABLED_AT_KEY = "cm:image-auto-save:enabled-at";
const ENABLED_AT_PREFIX = "cm:image-auto-save:enabled-at:v2:";
/** `lib/community-messenger/preferences.ts` 의 mediaAutoSave 저장 키 */
const MEDIA_AUTO_SAVE_PREF_KEY = "samarket:communityMessenger:mediaAutoSave";
const LEDGER_PREFIX = "cm:image-auto-save:v1:";
const LEDGER_MAX_IDS = 600;
/** 전체 실패 메시지 재시도: 총 시도 상한·최소 간격 */
export const MESSENGER_IMAGE_AUTO_SAVE_MAX_ATTEMPTS = 2;
export const MESSENGER_IMAGE_AUTO_SAVE_RETRY_DELAY_MS = 30_000;
const FAILED_MAX_ENTRIES = 100;

const CATCH_UP_PREFIX = "cm:image-auto-save:catchup:v1:";
/** catch-up 커서 계산용으로 기억하는 마지막 페이지 항목 상한(= API limit). */
const CATCH_UP_PAGE_MAX = 50;

type FailedEntry = { attempts: number; lastAt: number };
type Ledger = { ids: string[]; deniedAt: number | null; failed: Record<string, FailedEntry> };

function safeGet(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null): void {
  try {
    if (typeof window === "undefined") return;
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage 차단 — 자동 저장은 이번 세션 메모리 원장만 사용 */
  }
}

const memoryLedgers = new Map<string, Ledger>();
const inflightIds = new Set<string>();
let queue: Promise<void> = Promise.resolve();

function enabledAtKey(viewerUserId: string): string {
  return ENABLED_AT_PREFIX + viewerUserId;
}

/** 모든 계정의 기준 시각 + 구버전 전역 키 제거 — 설정 값은 기기 공용이므로 OFF 는 모든 계정의 ON 구간을 끝낸다. */
function clearAllEnabledAt(): void {
  safeSet(LEGACY_ENABLED_AT_KEY, null);
  try {
    if (typeof window === "undefined") return;
    const ls = window.localStorage;
    const keys: string[] = [];
    for (let i = 0; i < ls.length; i += 1) {
      const k = ls.key(i);
      if (k && k.startsWith(ENABLED_AT_PREFIX)) keys.push(k);
    }
    for (const k of keys) ls.removeItem(k);
  } catch {
    /* storage 차단 */
  }
}

function readMediaAutoSavePreference(): boolean | null {
  const raw = safeGet(MEDIA_AUTO_SAVE_PREF_KEY);
  if (raw == null) return null;
  return raw === "1";
}

/** 마지막으로 관측한 설정 값 — OFF→ON 전환(새 ON 구간) 감지용. */
let lastObservedEnabled: boolean | null = null;

/**
 * 설정 값 관측 — OFF 또는 OFF→ON 전환이면 기준 시각을 지운다(다음 저장 호출이 "지금"을 새 기준으로 잡음).
 * ON→ON(다른 설정 변경으로 이벤트만 온 경우)은 유지.
 */
function observeMediaAutoSavePreference(enabled: boolean): void {
  const prev = lastObservedEnabled;
  lastObservedEnabled = enabled;
  if (!enabled || prev === false) clearAllEnabledAt();
}

let preferenceObserverInstalled = false;
function installPreferenceObserver(): void {
  if (preferenceObserverInstalled || typeof window === "undefined") return;
  preferenceObserverInstalled = true;
  /** 구버전 전역 기준은 계정 구분이 없고 묵었을 수 있다 — 채택하지 않는다. */
  safeSet(LEGACY_ENABLED_AT_KEY, null);
  const initial = readMediaAutoSavePreference();
  lastObservedEnabled = initial === true;
  if (initial !== true) clearAllEnabledAt();
  const onChange = () => {
    observeMediaAutoSavePreference(readMediaAutoSavePreference() === true);
  };
  try {
    window.addEventListener(COMMUNITY_MESSENGER_PREFERENCE_EVENT, onChange);
    window.addEventListener("storage", (e) => {
      if (e.key === MEDIA_AUTO_SAVE_PREF_KEY || e.key === null) onChange();
    });
  } catch {
    /* ignore */
  }
}
installPreferenceObserver();

/**
 * 설정 토글 시 호출(호환) — 켜기/끄기 모두 새 ON 구간 시작으로 기준 제거.
 * 다음 자동 저장 호출이 계정별로 "지금"을 기준으로 기록한다(권한 재시도 포함).
 */
export function syncMessengerImageAutoSaveEnabled(enabled: boolean, nowMs?: number, viewerUserId?: string): void {
  lastObservedEnabled = enabled;
  clearAllEnabledAt();
  const viewer = viewerUserId?.trim();
  if (enabled && viewer && typeof nowMs === "number") safeSet(enabledAtKey(viewer), String(nowMs));
}

/** 계정별 기준 시각 — ON 인데 기준이 없으면 지금으로 기록. */
export function readMessengerImageAutoSaveEnabledAt(viewerUserId: string, nowMs = Date.now()): number {
  const key = enabledAtKey(viewerUserId.trim());
  const raw = Number(safeGet(key));
  if (Number.isFinite(raw) && raw > 0) return raw;
  safeSet(key, String(nowMs));
  return nowMs;
}

function readLedger(viewerUserId: string): Ledger {
  const key = LEDGER_PREFIX + viewerUserId;
  const mem = memoryLedgers.get(key);
  if (mem) return mem;
  let ledger: Ledger = { ids: [], deniedAt: null, failed: {} };
  try {
    const parsed = JSON.parse(safeGet(key) ?? "null") as Partial<Ledger> | null;
    if (parsed && Array.isArray(parsed.ids)) {
      const failed: Record<string, FailedEntry> = {};
      if (parsed.failed && typeof parsed.failed === "object") {
        for (const [id, v] of Object.entries(parsed.failed)) {
          const e = v as Partial<FailedEntry> | null;
          if (e && typeof e.attempts === "number" && typeof e.lastAt === "number") {
            failed[id] = { attempts: e.attempts, lastAt: e.lastAt };
          }
        }
      }
      ledger = {
        ids: parsed.ids.filter((x): x is string => typeof x === "string"),
        deniedAt: typeof parsed.deniedAt === "number" ? parsed.deniedAt : null,
        failed,
      };
    }
  } catch {
    /* 손상 — 새 원장 */
  }
  memoryLedgers.set(key, ledger);
  return ledger;
}

function writeLedger(viewerUserId: string, ledger: Ledger): void {
  const key = LEDGER_PREFIX + viewerUserId;
  const failedEntries = Object.entries(ledger.failed ?? {})
    .sort((a, b) => a[1].lastAt - b[1].lastAt)
    .slice(-FAILED_MAX_ENTRIES);
  const trimmed: Ledger = {
    ids: ledger.ids.slice(-LEDGER_MAX_IDS),
    deniedAt: ledger.deniedAt,
    failed: Object.fromEntries(failedEntries),
  };
  memoryLedgers.set(key, trimmed);
  safeSet(key, JSON.stringify(trimmed));
}

/** 자동 저장 대상 선별 (순수 함수 — 테스트 대상). */
export function selectMessengerImagesForAutoSave(input: {
  viewerUserId: string;
  messages: ReadonlyArray<CommunityMessengerMessage & { pending?: boolean }>;
  enabledAtMs: number;
  alreadyHandledIds: ReadonlySet<string>;
}): CommunityMessengerMessage[] {
  const out: CommunityMessengerMessage[] = [];
  for (const m of input.messages) {
    if (m.messageType !== "image" || m.pending) continue;
    if (m.isMine || (m.senderId && m.senderId === input.viewerUserId)) continue;
    if (m.deletedForEveryoneAt) continue;
    const id = String(m.id ?? "").trim();
    if (!id || id.startsWith("pending:") || input.alreadyHandledIds.has(id)) continue;
    const created = new Date(m.createdAt).getTime();
    if (!Number.isFinite(created) || created < input.enabledAtMs) continue;
    if (messengerImageOriginalUrls(m).length === 0) continue;
    out.push(m);
  }
  return out;
}

/** 전체 실패 후 재시도 대기 중인 id(최소 간격 미경과) 또는 상한 도달 id → 이번엔 건너뜀. */
function retryBlockedIds(ledger: Ledger, nowMs: number): string[] {
  const out: string[] = [];
  for (const [id, e] of Object.entries(ledger.failed)) {
    if (e.attempts >= MESSENGER_IMAGE_AUTO_SAVE_MAX_ATTEMPTS) out.push(id);
    else if (nowMs - e.lastAt < MESSENGER_IMAGE_AUTO_SAVE_RETRY_DELAY_MS) out.push(id);
  }
  return out;
}

/** 배치 결과 요약 — 전역 훅이 여러 배치(실시간·catch-up)를 한 번의 알림으로 합칠 때 쓴다. */
export type MessengerImageAutoSaveBatchSummary = { saved: number; failed: number; denied: boolean };

/**
 * 받은 사진 자동 저장(전역 훅·호환 호출부 공용). 설정 OFF 면 아무것도 하지 않는다.
 * 저장은 직렬 큐로 처리(동시 다발 권한 팝업·중복 방지).
 */
export function autoSaveIncomingMessengerImages(input: {
  enabled: boolean;
  viewerUserId: string;
  messages: ReadonlyArray<CommunityMessengerMessage & { pending?: boolean }>;
  onNotice?: (notice: MessengerImageSaveNotice & { auto: true; summary: MessengerImageAutoSaveBatchSummary }) => void;
  nowMs?: number;
}): void {
  const viewer = input.viewerUserId.trim();
  if (!input.enabled) {
    observeMediaAutoSavePreference(false);
    return;
  }
  if (!viewer) return;
  /** 이벤트를 못 받은 경로(다른 탭 등)에서도 OFF→ON 전환을 잡는다. */
  if (lastObservedEnabled === false) observeMediaAutoSavePreference(true);
  else lastObservedEnabled = true;
  const nowMs = input.nowMs ?? Date.now();
  const enabledAtMs = readMessengerImageAutoSaveEnabledAt(viewer, nowMs);
  const ledger = readLedger(viewer);
  if (ledger.deniedAt !== null && ledger.deniedAt >= enabledAtMs) return;
  const handled = new Set<string>([...ledger.ids, ...inflightIds, ...retryBlockedIds(ledger, nowMs)]);
  const targets = selectMessengerImagesForAutoSave({
    viewerUserId: viewer,
    messages: input.messages,
    enabledAtMs,
    alreadyHandledIds: handled,
  });
  if (targets.length === 0) return;
  for (const m of targets) inflightIds.add(m.id);

  queue = queue.then(async () => {
    try {
      /** 미지원·브리지 미준비 → 아무것도 원장에 남기지 않는다(다음 호출에서 재판정). */
      if ((await resolveMessengerImageSaveMode()) !== "native") return;
      let saved = 0;
      let failed = 0;
      let denied = false;
      for (const m of targets) {
        const current = readLedger(viewer);
        if (current.ids.includes(m.id)) continue;
        const outcome = await saveMessengerImages(messengerImageOriginalUrls(m));
        if (outcome.permissionDenied && outcome.savedCount === 0) {
          denied = true;
          writeLedger(viewer, { ...current, deniedAt: Date.now() });
          break;
        }
        const restFailed = { ...current.failed };
        delete restFailed[m.id];
        if (outcome.savedCount > 0) {
          /** 일부 성공(앨범)도 처리 완료 — 재시도하면 이미 저장한 장이 사진첩에 중복된다. */
          saved += outcome.savedCount;
          failed += outcome.failedCount;
          writeLedger(viewer, { ...current, ids: [...current.ids, m.id], failed: restFailed });
          continue;
        }
        const attempts = (current.failed[m.id]?.attempts ?? 0) + 1;
        if (attempts >= MESSENGER_IMAGE_AUTO_SAVE_MAX_ATTEMPTS) {
          /** 최종 포기 — 처리 원장에 넣어 더 이상 시도하지 않고, 실패를 이때만 알린다. */
          failed += Math.max(1, outcome.failedCount);
          writeLedger(viewer, { ...current, ids: [...current.ids, m.id], failed: restFailed });
        } else {
          writeLedger(viewer, { ...current, failed: { ...current.failed, [m.id]: { attempts, lastAt: Date.now() } } });
        }
      }
      const notice = messengerImageSaveNotice({
        mode: "native",
        total: saved + failed,
        savedCount: saved,
        failedCount: failed,
        permissionDenied: denied,
      });
      if (saved + failed > 0 || denied) {
        input.onNotice?.({ ...notice, auto: true, summary: { saved, failed, denied } });
      }
    } finally {
      for (const m of targets) inflightIds.delete(m.id);
    }
  });
}

/**
 * catch-up 조회 기준(`since`) — 계정별 기준 시각과 마지막 catch-up 페이지 커서 중 늦은 쪽.
 * 커서 = 마지막 페이지에서 **아직 처리 원장에 없는 첫 항목**의 시각(재시도·권한 거부 항목을 건너뛰지 않음),
 * 모두 처리됐으면 페이지 마지막 항목 시각(gte 이므로 그 1건은 다시 오지만 원장으로 무시).
 * 설정 OFF→ON 으로 기준 시각이 새로 잡히면 그 이후만 본다(옛 커서가 더 이르면 기준 시각이 이긴다).
 */
export function messengerImageAutoSaveCatchUpSinceMs(viewerUserId: string, nowMs = Date.now()): number {
  const viewer = viewerUserId.trim();
  const enabledAtMs = readMessengerImageAutoSaveEnabledAt(viewer, nowMs);
  let page: Array<[string, number]> = [];
  try {
    const parsed = JSON.parse(safeGet(CATCH_UP_PREFIX + viewer) ?? "null") as { items?: unknown } | null;
    if (parsed && Array.isArray(parsed.items)) {
      page = parsed.items.filter(
        (x): x is [string, number] => Array.isArray(x) && typeof x[0] === "string" && typeof x[1] === "number",
      );
    }
  } catch {
    page = [];
  }
  if (page.length === 0) return enabledAtMs;
  const settled = new Set(readLedger(viewer).ids);
  const firstOpen = page.find(([id]) => !settled.has(id));
  const cursor = firstOpen ? firstOpen[1] : page[page.length - 1]![1];
  return Math.max(enabledAtMs, cursor);
}

/** catch-up 응답 페이지 기록(오름차순). 다음 `messengerImageAutoSaveCatchUpSinceMs` 가 커서로 쓴다. */
export function noteMessengerImageAutoSaveCatchUpPage(
  viewerUserId: string,
  messages: ReadonlyArray<Pick<CommunityMessengerMessage, "id" | "createdAt">>,
): void {
  const viewer = viewerUserId.trim();
  if (!viewer || messages.length === 0) return;
  const items: Array<[string, number]> = [];
  for (const m of messages.slice(-CATCH_UP_PAGE_MAX)) {
    const t = new Date(m.createdAt).getTime();
    const id = String(m.id ?? "").trim();
    if (id && Number.isFinite(t)) items.push([id, t]);
  }
  if (items.length === 0) return;
  safeSet(CATCH_UP_PREFIX + viewer, JSON.stringify({ items }));
}

/** 테스트 전용 — 모듈 메모리 초기화 */
export function __resetMessengerImageAutoSaveForTests(): void {
  memoryLedgers.clear();
  inflightIds.clear();
  queue = Promise.resolve();
  lastObservedEnabled = null;
}
