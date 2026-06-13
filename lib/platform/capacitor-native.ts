type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
};

function readCapacitorGlobal(): CapacitorGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor;
}

/** Capacitor Android/iOS WebView 셸에서 실행 중인지 */
export function isCapacitorNativePlatform(): boolean {
  return readCapacitorGlobal()?.isNativePlatform?.() === true;
}
