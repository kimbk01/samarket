/**
 * Android 첫 화면 ◁ — 감사 docs/audit/android-system-nav-2026-11-17/README.md
 *   D1 (Owner 「Start F1·F2·F3」 2026-11-17): 갈 곳 없는 첫 화면에서 ◁ 무반응 → 앱 내리기.
 *   F4 (Owner 「F4 는 (가) Android 표준으로 진행」 2026-11-17): 하단 탭 첫 화면 ◁ = 시작 탭(첫 번째 탭, 메인 = HOME)으로,
 *       시작 탭 첫 화면 ◁ = 앱 내리기. Android Navigation 의 하단 탭 규칙과 같다.
 *
 * 「첫 화면」 판정 (그 밖의 화면은 손대지 않음 = Capacitor 기본 goBack):
 *   1) 하단 탭을 눌러 이동한 기록 항목 — 탭 이동은 replace 라 이동 전후 기록 항목 key 가 같다. 커밋 순간 그 key 를 표시한다.
 *   2) 앱 기록의 첫 항목(index 0) — 주소가 어떤 탭의 첫 화면 주소와 같으면 그 탭, 아니면 탭 없음(앱 내리기).
 *   화면 안 링크로 같은 주소에 들어온 경우(예: 채팅방 → 내정보)는 첫 화면이 아니다 → 이전 화면으로(Android 표준과 같음).
 *
 * Android 셸만 — iOS·웹·Windows 는 설치하지 않는다. Navigation API 가 없으면 아무것도 하지 않는다(지금 동작).
 */
import { resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
import { minimizeAppForBack, setRootBackAction } from "@/lib/ui/overlay-back-stack";

type NavEntry = { index: number; key?: string };
type NavigationLike = {
  currentEntry: NavEntry | null;
  addEventListener: (type: "currententrychange", fn: () => void) => void;
  removeEventListener: (type: "currententrychange", fn: () => void) => void;
};

/** 현재 보이는 하단 탭 막대가 알려 주는 탭 정보. */
export type RootBackTabBar = {
  /** 첫 번째 탭(시작 탭) id — 메인 막대에서는 HOME */
  startTabId: string;
  /** 탭 id → 그 탭 첫 화면 주소(경로만) */
  tabRootPaths: ReadonlyArray<{ tabId: string; path: string }>;
  /** 시작 탭을 누른 것과 같은 이동. 막대가 없어 못 하면 false */
  goStartTab: () => boolean;
};

const MARK_STORAGE_KEY = "dibay.androidTabRootEntries.v1";
const MARK_LIMIT = 50;

let nav: NavigationLike | null = null;
let tabBar: RootBackTabBar | null = null;
/** 기록 항목 key → 하단 탭 id (하단 탭으로 들어온 항목) */
let marks = new Map<string, string>();
let started = false;
const defaultPathname = () => (typeof window === "undefined" ? "" : window.location.pathname);
let pathnameReader: () => string = defaultPathname;

function normalizePath(path: string): string {
  return (path.split("?")[0] ?? "").trim().replace(/\/+$/, "") || "/";
}

function loadMarks(): Map<string, string> {
  try {
    const raw = window.sessionStorage.getItem(MARK_STORAGE_KEY);
    if (!raw) return new Map();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Map();
    return new Map(
      arr.filter(
        (x): x is [string, string] =>
          Array.isArray(x) && x.length === 2 && typeof x[0] === "string" && typeof x[1] === "string",
      ),
    );
  } catch {
    return new Map();
  }
}

function saveMarks(): void {
  try {
    const arr = [...marks.entries()].slice(-MARK_LIMIT);
    window.sessionStorage.setItem(MARK_STORAGE_KEY, JSON.stringify(arr));
  } catch {
    /* 저장 실패 — 이 문서 안에서만 유지(다시 열면 index 0 판정으로 돌아감) */
  }
}

function readNavigation(): NavigationLike | null {
  if (typeof window === "undefined") return null;
  const n = (window as unknown as { navigation?: NavigationLike }).navigation;
  if (!n || typeof n.addEventListener !== "function" || !("currentEntry" in n)) return null;
  return n;
}

/** 현재 기록 항목이 어느 탭의 첫 화면인가. 첫 화면이지만 탭이 아니면 "", 첫 화면이 아니면 null. */
export function resolveCurrentRootTab(): string | null {
  const cur = nav?.currentEntry;
  if (!cur) return null;
  if (cur.key && marks.has(cur.key)) return marks.get(cur.key) ?? null;
  if (cur.index !== 0) return null;
  const path = normalizePath(pathnameReader());
  const hit = tabBar?.tabRootPaths.find((t) => normalizePath(t.path) === path);
  if (hit) return hit.tabId;
  if (path === "/" && tabBar) return tabBar.startTabId; // 앱 첫 주소 `/` = 시작 탭(HOME)
  return "";
}

function backActionFor(rootTab: string | null): (() => void) | null {
  if (rootTab == null) return null;
  const bar = tabBar;
  if (rootTab === "" || !bar || rootTab === bar.startTabId) return minimizeAppForBack;
  return () => {
    /** 누른 순간의 막대로 이동(막대가 다시 그려져도 최신 이동 함수 사용) */
    const current = tabBar;
    if (!current || !current.goStartTab()) minimizeAppForBack();
  };
}

/** 같은 판정이면 같은 함수를 돌려 리스너를 다시 설치하지 않는다. */
let lastActionKey = "";
let lastAction: (() => void) | null = null;

function sync(): void {
  const rootTab = resolveCurrentRootTab();
  const key = `${rootTab ?? "-"}|${tabBar?.startTabId ?? ""}|${tabBar ? "bar" : "nobar"}`;
  if (key !== lastActionKey) {
    lastActionKey = key;
    lastAction = backActionFor(rootTab);
  }
  setRootBackAction(lastAction);
}

/** 하단 탭 이동 커밋이 실제로 이동했을 때 1회 — 그 기록 항목을 그 탭의 첫 화면으로 표시. */
export function markBottomNavTabRootEntry(tabId: string): void {
  if (!started || !tabId) return;
  const key = nav?.currentEntry?.key;
  if (!key) return;
  marks.delete(key);
  marks.set(key, tabId);
  saveMarks();
  sync();
}

/** 하단 탭 막대(BottomNav)가 보이는 동안 등록. 반환 = 해제. */
export function registerRootBackTabBar(bar: RootBackTabBar): () => void {
  tabBar = bar;
  if (started) sync();
  return () => {
    if (tabBar !== bar) return;
    tabBar = null;
    if (started) sync();
  };
}

/** Android 메인 앱에서 1회 시작. 반환 = 정리 함수. `platform`·`nav`·`pathname` 은 시험용 주입. */
export function startAndroidRootBackTracking(
  opts: { platform?: string; nav?: NavigationLike | null; pathname?: () => string } = {},
): () => void {
  const platform = opts.platform ?? resolveCapacitorShellPlatform();
  if (platform !== "android") return () => {};
  const n = opts.nav !== undefined ? opts.nav : readNavigation();
  if (!n) return () => {};
  nav = n;
  if (opts.pathname) pathnameReader = opts.pathname;
  marks = loadMarks();
  started = true;
  lastActionKey = "";
  lastAction = null;
  n.addEventListener("currententrychange", sync);
  sync();
  return () => {
    n.removeEventListener("currententrychange", sync);
    started = false;
    nav = null;
    lastActionKey = "";
    lastAction = null;
    pathnameReader = defaultPathname;
    setRootBackAction(null);
  };
}

/** Tests only. */
export function __resetAndroidRootBackForTests(): void {
  nav = null;
  tabBar = null;
  marks = new Map();
  started = false;
  lastActionKey = "";
  lastAction = null;
  pathnameReader = defaultPathname;
  try {
    window.sessionStorage.removeItem(MARK_STORAGE_KEY);
  } catch {
    /* no storage */
  }
}
