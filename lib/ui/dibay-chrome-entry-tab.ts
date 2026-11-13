/**
 * 공용 화면(알림·전체 검색·설정 등) 헤더 색 = 들어온 탭의 색 (헤더 SSOT 3단계 C2).
 * 탭 화면에 있을 때 그 탭 id 를 기록하고, 공용 화면은 이 기록을 읽는다.
 * 저장: sessionStorage(앱을 다시 켜면 비어 있음 → 내정보 색) + 같은 탭 안 구독자 알림.
 */

type TabId = "home" | "community" | "delivery" | "chat" | "mypage";

const STORAGE_KEY = "dibay.chrome.entryTab";
const TAB_IDS: ReadonlySet<string> = new Set(["home", "community", "delivery", "chat", "mypage"]);

let memo: TabId | null | undefined;
const listeners = new Set<() => void>();

function readStorage(): TabId | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.sessionStorage.getItem(STORAGE_KEY);
    return v && TAB_IDS.has(v) ? (v as TabId) : null;
  } catch {
    return null;
  }
}

export function readDibayChromeEntryTab(): TabId | null {
  if (typeof window === "undefined") return null;
  if (memo === undefined) memo = readStorage();
  return memo;
}

export function subscribeDibayChromeEntryTab(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 탭 화면에 들어갈 때마다 호출 — 값이 바뀔 때만 구독자에게 알린다 */
export function recordDibayChromeEntryTab(tab: TabId): void {
  if (typeof window === "undefined") return;
  if (readDibayChromeEntryTab() === tab) return;
  memo = tab;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, tab);
  } catch {
    /* 저장 불가(사생활 모드 등) — 이번 실행 동안은 메모리 값 사용 */
  }
  for (const l of listeners) l();
}
