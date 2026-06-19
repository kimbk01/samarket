/** APK-only launch — https:// intent 금지 (Chrome leak 방지). */
export const DIBAY_PKG = "com.dibay.app";
export const DIBAY_MAIN_ACTIVITY = `${DIBAY_PKG}/.MainActivity`;
export const DIBAY_MESSENGER_DEEPLINK = "dibay://app/community-messenger";

export function adbShell(spawnSync, adbPath, serial, ...args) {
  const argv = serial ? ["-s", serial, ...args] : args;
  return spawnSync(adbPath, argv, { encoding: "utf8" });
}

export function launchApkMessenger(spawnSync, adbPath, serial) {
  adbShell(spawnSync, adbPath, serial, "shell", "am", "start", "-n", DIBAY_MAIN_ACTIVITY);
  adbShell(
    spawnSync,
    adbPath,
    serial,
    "shell",
    "am",
    "start",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    DIBAY_MESSENGER_DEEPLINK,
    "-n",
    DIBAY_MAIN_ACTIVITY
  );
}

export function readForegroundPackage(spawnSync, adbPath, serial) {
  const r = adbShell(spawnSync, adbPath, serial, "shell", "dumpsys", "activity", "activities");
  const text = r.stdout ?? "";
  const resumed = text.match(/topResumedActivity=ActivityRecord\{[^ ]+ \w+ ([^\s/]+)\//);
  if (resumed?.[1]) return resumed[1];
  if (/com\.dibay\.app/.test(text)) return DIBAY_PKG;
  if (/com\.android\.chrome/.test(text)) return "com.android.chrome";
  return null;
}

export function assertApkForeground(spawnSync, adbPath, serial) {
  const pkg = readForegroundPackage(spawnSync, adbPath, serial);
  if (pkg !== DIBAY_PKG) {
    throw new Error(`APK foreground expected ${DIBAY_PKG}, got ${pkg ?? "unknown"} (Chrome=https FAIL)`);
  }
  return pkg;
}
