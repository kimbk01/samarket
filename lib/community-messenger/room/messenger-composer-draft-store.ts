/**
 * K-5 — 메신저 방별 보내지 않은 입력 임시 저장.
 *
 * 방 클라이언트가 방마다 새로 마운트되므로 composer state 만으로는 방 전환·이탈 시 입력이 사라진다.
 * 모듈 Map(같은 탭 즉시) + sessionStorage(새로고침·WebView 재생성 대비, 접근 실패는 무시) 2단 저장.
 * 키 = `${viewerUserId}:${roomId}` — 계정 전환 시 다른 사용자의 초안이 보이지 않게.
 */

const memory = new Map<string, string>();
const STORAGE_PREFIX = "cm-composer-draft:v1:";
/** 과도한 저장 방지 — 메시지 최대 길이보다 넉넉하게 */
const MAX_DRAFT_CHARS = 8000;

export const MESSENGER_COMPOSER_DRAFT_SAVE_DEBOUNCE_MS = 300;

export function messengerComposerDraftKey(viewerUserId: string | null | undefined, roomId: string | null | undefined): string | null {
  const uid = String(viewerUserId ?? "").trim();
  const rid = String(roomId ?? "").trim();
  if (!uid || !rid) return null;
  return `${uid}:${rid}`;
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function readMessengerComposerDraft(key: string | null): string {
  if (!key) return "";
  const hit = memory.get(key);
  if (hit !== undefined) return hit;
  try {
    const v = storage()?.getItem(STORAGE_PREFIX + key);
    if (typeof v === "string" && v) {
      memory.set(key, v);
      return v;
    }
  } catch {
    /* ignore */
  }
  return "";
}

export function writeMessengerComposerDraft(key: string | null, value: string): void {
  if (!key) return;
  if (!value.trim()) {
    clearMessengerComposerDraft(key);
    return;
  }
  const v = value.length > MAX_DRAFT_CHARS ? value.slice(0, MAX_DRAFT_CHARS) : value;
  memory.set(key, v);
  try {
    storage()?.setItem(STORAGE_PREFIX + key, v);
  } catch {
    /* quota·private mode — 메모리 저장만 유지 */
  }
}

export function clearMessengerComposerDraft(key: string | null): void {
  if (!key) return;
  memory.delete(key);
  try {
    storage()?.removeItem(STORAGE_PREFIX + key);
  } catch {
    /* ignore */
  }
}

/** 테스트 전용 — 모듈 메모리만 비운다 */
export function __resetMessengerComposerDraftMemoryForTests(): void {
  memory.clear();
}
