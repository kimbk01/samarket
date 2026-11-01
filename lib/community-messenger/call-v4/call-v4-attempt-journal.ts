/**
 * 발신 시도 기록 — android-caller-stuck-after-remote-missed-design §15-4 (4).
 *
 * 세션 생성 요청을 보내기 전에 시도 ID 를 저장하고, 생성 응답(통화 ID)을 **받은 직후** 지운다.
 * 웹이 다시 로드됐는데 기록이 남아 있으면 그 웹은 생성 응답을 받지 못한 것이다 → 네이티브도 그 통화를 넘겨받았을
 * 수 없으므로(넘겨받으려면 응답의 통화 ID 가 필요) 시도 취소로 정리해도 살아 있는 통화를 끊지 않는다.
 * WebView 를 새로 만들어도(Android 렌더러 종료 후 재생성) 남도록 localStorage 를 쓴다.
 * 앱(Capacitor Android·iOS, WebView 1개)에서만 쓴다 — 데스크톱 브라우저는 탭끼리 localStorage 를 같이 써서
 * 새 탭이 다른 탭의 진행 중 시도를 취소할 수 있으므로 기록하지 않는다.
 */

import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

const KEY = "dibay.callV4.pendingAttempt.v1";
/** 이보다 오래된 기록은 정리만 한다(통화는 이미 상대 쪽 시간 제한으로 끝났다). */
export const CALL_ATTEMPT_JOURNAL_MAX_AGE_MS = 10 * 60_000;

type Entry = { attemptId: string; createdAtMs: number };

function storage(): Storage | null {
  try {
    if (typeof window === "undefined" || !isCapacitorNativePlatform()) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function recordCallAttemptJournal(attemptId: string, nowMs = Date.now()): void {
  const id = attemptId.trim();
  if (!id) return;
  try {
    storage()?.setItem(KEY, JSON.stringify({ attemptId: id, createdAtMs: nowMs } satisfies Entry));
  } catch {
    /* 저장 실패 — 재로드 복구만 빠진다(네이티브·서버 경로는 그대로) */
  }
}

/** 같은 시도일 때만 지운다(뒤 시도의 기록을 앞 시도가 지우지 않게). */
export function clearCallAttemptJournal(attemptId: string): void {
  const id = attemptId.trim();
  if (!id) return;
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return;
    const entry = JSON.parse(raw) as Partial<Entry>;
    if (entry?.attemptId === id) storage()?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/**
 * 부팅 시 1회 — 남은 기록을 꺼내고 지운다. 시도 취소가 필요하면 attemptId, 아니면 null.
 * @param inFlightAttemptId 지금 이 웹에서 진행 중인 시도(있으면 건드리지 않는다)
 */
export function takePendingCallAttemptJournal(
  inFlightAttemptId: string | null,
  nowMs = Date.now(),
): string | null {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Partial<Entry>;
    const id = typeof entry?.attemptId === "string" ? entry.attemptId.trim() : "";
    if (!id || (inFlightAttemptId && id === inFlightAttemptId.trim())) return null;
    storage()?.removeItem(KEY);
    const age = nowMs - Number(entry?.createdAtMs ?? 0);
    if (!Number.isFinite(age) || age < 0 || age > CALL_ATTEMPT_JOURNAL_MAX_AGE_MS) return null;
    return id;
  } catch {
    try {
      storage()?.removeItem(KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}
