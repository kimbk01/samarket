/**
 * D1 — Android 첫 화면 ◁ 무반응 수정 (감사 docs/audit/android-system-nav-2026-11-17/README.md · Owner 「Start F1·F2·F3」 2026-11-17).
 *
 * 웹 기록 첫 항목(Navigation API `currentEntry.index === 0`)일 때만 `overlay-back-stack` 의 단일 리스너를 켠다.
 * 그 화면에서 ◁ → 열린 오버레이가 없으면 `App.minimizeApp()`(기기 기본 뒤로와 같은 결과)으로 앱을 내린다.
 * index > 0 화면은 손대지 않는다(Capacitor 기본 goBack 그대로). Navigation API 가 없으면 아무것도 하지 않는다(지금 동작).
 * Android 셸만 — iOS·웹·Windows 는 설치하지 않는다.
 */
import { resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
import { setNavigationRootBackActive } from "@/lib/ui/overlay-back-stack";

type NavEntry = { index: number };
type NavigationLike = {
  currentEntry: NavEntry | null;
  addEventListener: (type: "currententrychange", fn: () => void) => void;
  removeEventListener: (type: "currententrychange", fn: () => void) => void;
};

function readNavigation(): NavigationLike | null {
  if (typeof window === "undefined") return null;
  const nav = (window as unknown as { navigation?: NavigationLike }).navigation;
  if (!nav || typeof nav.addEventListener !== "function" || !("currentEntry" in nav)) return null;
  return nav;
}

/** 웹 기록 첫 항목인가. Navigation API 가 없으면 false(지금 동작 유지). */
export function isNavigationRootEntry(nav: NavigationLike | null = readNavigation()): boolean {
  const cur = nav?.currentEntry;
  return Boolean(cur && cur.index === 0);
}

/**
 * Android 메인 앱에서 1회 시작. 반환 = 정리 함수.
 * `platform` · `nav` 는 시험용 주입.
 */
export function startAndroidRootBackTracking(
  opts: { platform?: string; nav?: NavigationLike | null } = {},
): () => void {
  const platform = opts.platform ?? resolveCapacitorShellPlatform();
  if (platform !== "android") return () => {};
  const nav = opts.nav !== undefined ? opts.nav : readNavigation();
  if (!nav) return () => {};
  const sync = () => setNavigationRootBackActive(isNavigationRootEntry(nav));
  nav.addEventListener("currententrychange", sync);
  sync();
  return () => {
    nav.removeEventListener("currententrychange", sync);
    setNavigationRootBackActive(false);
  };
}
