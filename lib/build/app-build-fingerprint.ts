import { GENERATED_APP_BUILD_FINGERPRINT } from "@/lib/build/generated-app-build-fingerprint";

export type AppBuildFingerprint = {
  gitSha: string;
  gitShaFull: string;
  gitDirty: boolean;
  buildTimestamp: string;
  buildConfiguration: string;
  bundleId: string;
  webDeploySha: string | null;
  environment: string;
  /** Capacitor App.getInfo when available */
  versionName: string | null;
  buildNumber: string | null;
};

let loggedOnce = false;

export function getStaticAppBuildFingerprint(): Omit<
  AppBuildFingerprint,
  "versionName" | "buildNumber"
> {
  const g = GENERATED_APP_BUILD_FINGERPRINT;
  return {
    gitSha: g.gitSha,
    gitShaFull: g.gitShaFull,
    gitDirty: Boolean(g.gitDirty),
    buildTimestamp: g.buildTimestamp,
    buildConfiguration: g.buildConfiguration,
    bundleId: g.bundleId,
    webDeploySha: g.webDeploySha ?? null,
    environment: g.environment,
  };
}

export async function getAppBuildFingerprint(): Promise<AppBuildFingerprint> {
  const base = getStaticAppBuildFingerprint();
  let versionName: string | null = null;
  let buildNumber: string | null = null;
  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    versionName = info.version?.trim() || null;
    buildNumber = info.build?.trim() || null;
  } catch {
    /* web / plugin missing */
  }
  return { ...base, versionName, buildNumber };
}

/** Cold start / QA — `[DIBAY_BUILD]` filter. No secrets. */
export function logAppBuildFingerprintOnce(source = "js"): void {
  if (typeof window === "undefined") return;
  if (loggedOnce) return;
  loggedOnce = true;
  const staticFp = getStaticAppBuildFingerprint();
  console.info(
    `[DIBAY_BUILD] fingerprint source=${source} ${JSON.stringify({
      gitSha: staticFp.gitSha,
      buildConfiguration: staticFp.buildConfiguration,
      buildTimestamp: staticFp.buildTimestamp,
      gitDirty: staticFp.gitDirty,
      bundleId: staticFp.bundleId,
      webDeploySha: staticFp.webDeploySha,
      environment: staticFp.environment,
    })}`,
  );
  void getAppBuildFingerprint().then((fp) => {
    console.info(
      `[DIBAY_BUILD] native_app_info versionName=${fp.versionName ?? "null"} buildNumber=${fp.buildNumber ?? "null"}`,
    );
  });
}

/** Test helper */
export function resetAppBuildFingerprintLogForTests(): void {
  loggedOnce = false;
}
