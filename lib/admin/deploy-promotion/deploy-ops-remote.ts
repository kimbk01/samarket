/**
 * Read-only remote ops probes for Owner deploy admin (TEST surface).
 * Never enables Production promote. Missing tokens → NOT_PROVEN (not PASS).
 */

export type OpsProbeStatus =
  | "ok"
  | "blocked"
  | "miswired"
  | "not_proven"
  | "error"
  | "stale";

export type EnvServerCard = {
  envId: "preview" | "test" | "production";
  labelKo: string;
  labelEn: string;
  status: OpsProbeStatus;
  statusReason: string;
  url: string | null;
  versionSha: string | null;
  deploymentId: string | null;
  deployedAt: string | null;
  deployState: string | null;
  supabaseProjectRef: string | null;
  lastCheckedAt: string;
  lastError: string | null;
  canTest: boolean;
  canPromoteToProduction: boolean;
  source: "runtime" | "github" | "vercel" | "config" | "none";
};

export type ChangeFileRow = {
  path: string;
  status: "added" | "modified" | "removed" | "renamed" | "changed";
  category:
    | "web"
    | "api"
    | "db"
    | "android"
    | "ios"
    | "env"
    | "admin"
    | "other";
  summaryKo: string;
  summaryEn: string;
};

export type ChangeCompareResult = {
  status: OpsProbeStatus;
  statusReason: string;
  baseSha: string | null;
  headSha: string | null;
  aheadBy: number | null;
  behindBy: number | null;
  commits: number | null;
  files: ChangeFileRow[];
  hasDbMigration: boolean;
  hasAndroidNative: boolean;
  hasIosNative: boolean;
  hasEnvHint: boolean;
  fetchedAt: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function readToken(env: NodeJS.ProcessEnv): string {
  return (
    env.DIBAY_DEPLOY_GITHUB_READ_TOKEN ??
    env.DIBAY_PROMOTE_GITHUB_TOKEN ??
    env.GITHUB_TOKEN ??
    ""
  ).trim();
}

function repoSlug(env: NodeJS.ProcessEnv): string {
  return (env.DIBAY_PROMOTE_GITHUB_REPO ?? env.GITHUB_REPOSITORY ?? "kimbk01/samarket").trim();
}

function categorizePath(path: string): ChangeFileRow["category"] {
  if (path.startsWith("supabase/") || path.includes("migration")) return "db";
  if (path.startsWith("android/") || path.includes("capacitor")) return "android";
  if (path.startsWith("ios/")) return "ios";
  if (path.includes(".env") || path.includes("environment.env")) return "env";
  if (path.startsWith("app/api/") || path.includes("/api/")) return "api";
  if (path.startsWith("app/admin/") || path.startsWith("components/admin/") || path.startsWith("lib/admin/"))
    return "admin";
  if (path.startsWith("app/") || path.startsWith("components/") || path.startsWith("lib/")) return "web";
  return "other";
}

function summarizePath(path: string, status: ChangeFileRow["status"]): {
  ko: string;
  en: string;
} {
  const cat = categorizePath(path);
  const verbKo =
    status === "added" ? "추가" : status === "removed" ? "삭제" : status === "renamed" ? "이름 변경" : "수정";
  const verbEn =
    status === "added" ? "Added" : status === "removed" ? "Removed" : status === "renamed" ? "Renamed" : "Changed";
  const area: Record<ChangeFileRow["category"], { ko: string; en: string }> = {
    web: { ko: "웹 화면·로직", en: "Web UI/logic" },
    api: { ko: "API", en: "API" },
    db: { ko: "DB·마이그레이션 (웹 배포와 별도 승인)", en: "DB/migration (separate from web deploy)" },
    android: { ko: "Android 네이티브", en: "Android native" },
    ios: { ko: "iOS 네이티브", en: "iOS native" },
    env: { ko: "환경변수·설정", en: "Env/config" },
    admin: { ko: "관리자", en: "Admin" },
    other: { ko: "기타", en: "Other" },
  };
  return {
    ko: `${area[cat].ko} ${verbKo}: ${path}`,
    en: `${verbEn} ${area[cat].en}: ${path}`,
  };
}

function mapGithubFileStatus(raw: string | undefined): ChangeFileRow["status"] {
  switch ((raw ?? "").toLowerCase()) {
    case "added":
      return "added";
    case "removed":
      return "removed";
    case "renamed":
      return "renamed";
    case "modified":
      return "modified";
    default:
      return "changed";
  }
}

export async function fetchGithubMainSha(
  env: NodeJS.ProcessEnv = process.env
): Promise<{ sha: string | null; status: OpsProbeStatus; reason: string }> {
  const token = readToken(env);
  const repo = repoSlug(env);
  if (!token) {
    return {
      sha: null,
      status: "not_proven",
      reason: "github_read_token_missing",
    };
  }
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/main`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return { sha: null, status: "error", reason: `github_main_ref_${res.status}` };
    }
    const json = (await res.json()) as { object?: { sha?: string } };
    const sha = (json.object?.sha ?? "").toLowerCase() || null;
    return sha
      ? { sha, status: "ok", reason: "github_main_ref" }
      : { sha: null, status: "error", reason: "github_main_sha_empty" };
  } catch (e) {
    return {
      sha: null,
      status: "error",
      reason: e instanceof Error ? e.message : "github_main_fetch_failed",
    };
  }
}

export async function fetchGithubCompare(
  baseSha: string,
  headSha: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<ChangeCompareResult> {
  const fetchedAt = nowIso();
  const token = readToken(env);
  const repo = repoSlug(env);
  if (!token) {
    return {
      status: "not_proven",
      statusReason: "github_read_token_missing",
      baseSha,
      headSha,
      aheadBy: null,
      behindBy: null,
      commits: null,
      files: [],
      hasDbMigration: false,
      hasAndroidNative: false,
      hasIosNative: false,
      hasEnvHint: false,
      fetchedAt,
    };
  }
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/compare/${baseSha}...${headSha}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        cache: "no-store",
      }
    );
    if (!res.ok) {
      return {
        status: "error",
        statusReason: `github_compare_${res.status}`,
        baseSha,
        headSha,
        aheadBy: null,
        behindBy: null,
        commits: null,
        files: [],
        hasDbMigration: false,
        hasAndroidNative: false,
        hasIosNative: false,
        hasEnvHint: false,
        fetchedAt,
      };
    }
    const json = (await res.json()) as {
      ahead_by?: number;
      behind_by?: number;
      commits?: unknown[];
      files?: Array<{ filename?: string; status?: string; previous_filename?: string }>;
    };
    const files: ChangeFileRow[] = (json.files ?? []).slice(0, 200).map((f) => {
      const path = f.filename ?? f.previous_filename ?? "unknown";
      const status = mapGithubFileStatus(f.status);
      const summary = summarizePath(path, status);
      return {
        path,
        status,
        category: categorizePath(path),
        summaryKo: summary.ko,
        summaryEn: summary.en,
      };
    });
    return {
      status: "ok",
      statusReason: "github_compare",
      baseSha,
      headSha,
      aheadBy: json.ahead_by ?? null,
      behindBy: json.behind_by ?? null,
      commits: json.commits?.length ?? null,
      files,
      hasDbMigration: files.some((f) => f.category === "db"),
      hasAndroidNative: files.some((f) => f.category === "android"),
      hasIosNative: files.some((f) => f.category === "ios"),
      hasEnvHint: files.some((f) => f.category === "env"),
      fetchedAt,
    };
  } catch (e) {
    return {
      status: "error",
      statusReason: e instanceof Error ? e.message : "github_compare_failed",
      baseSha,
      headSha,
      aheadBy: null,
      behindBy: null,
      commits: null,
      files: [],
      hasDbMigration: false,
      hasAndroidNative: false,
      hasIosNative: false,
      hasEnvHint: false,
      fetchedAt,
    };
  }
}

export type VercelDeployProbe = {
  status: OpsProbeStatus;
  statusReason: string;
  deploymentId: string | null;
  url: string | null;
  readyState: string | null;
  createdAt: string | null;
  sha: string | null;
};

/** Optional Vercel API — without token returns NOT_PROVEN. */
export async function fetchVercelTargetDeploy(
  target: "production" | "preview",
  env: NodeJS.ProcessEnv = process.env
): Promise<VercelDeployProbe> {
  const token = (env.DIBAY_VERCEL_TOKEN ?? env.VERCEL_TOKEN ?? "").trim();
  const projectId = (env.DIBAY_VERCEL_PROJECT_ID ?? env.VERCEL_PROJECT_ID ?? "").trim();
  const teamId = (env.DIBAY_VERCEL_TEAM_ID ?? env.VERCEL_TEAM_ID ?? "").trim();
  if (!token || !projectId) {
    return {
      status: "not_proven",
      statusReason: "vercel_token_or_project_missing",
      deploymentId: null,
      url: null,
      readyState: null,
      createdAt: null,
      sha: null,
    };
  }
  try {
    const qs = new URLSearchParams({
      projectId,
      target,
      limit: "1",
    });
    if (teamId) qs.set("teamId", teamId);
    const res = await fetch(`https://api.vercel.com/v6/deployments?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        status: "error",
        statusReason: `vercel_list_${res.status}`,
        deploymentId: null,
        url: null,
        readyState: null,
        createdAt: null,
        sha: null,
      };
    }
    const json = (await res.json()) as {
      deployments?: Array<{
        uid?: string;
        url?: string;
        readyState?: string;
        created?: number;
        meta?: { githubCommitSha?: string };
      }>;
    };
    const d = json.deployments?.[0];
    if (!d) {
      return {
        status: "not_proven",
        statusReason: "vercel_no_deployments",
        deploymentId: null,
        url: null,
        readyState: null,
        createdAt: null,
        sha: null,
      };
    }
    return {
      status: d.readyState === "READY" ? "ok" : "not_proven",
      statusReason: d.readyState ?? "unknown",
      deploymentId: d.uid ?? null,
      url: d.url ? `https://${d.url}` : null,
      readyState: d.readyState ?? null,
      createdAt: d.created ? new Date(d.created).toISOString() : null,
      sha: d.meta?.githubCommitSha?.toLowerCase() ?? null,
    };
  } catch (e) {
    return {
      status: "error",
      statusReason: e instanceof Error ? e.message : "vercel_fetch_failed",
      deploymentId: null,
      url: null,
      readyState: null,
      createdAt: null,
      sha: null,
    };
  }
}

export function buildTestEnvCard(input: {
  runtimeSha: string | null;
  projectRef: string | null;
  databaseTarget: string;
  bannerVariant: string;
  vercelTargetEnv: string | null;
  deploymentUrl: string | null;
  promoteAllowed: boolean;
}): EnvServerCard {
  const miswired = input.bannerVariant === "miswired";
  const isTest =
    input.bannerVariant === "test" ||
    input.vercelTargetEnv === "test" ||
    input.databaseTarget === "non_production" ||
    input.databaseTarget.includes("non_prod");
  return {
    envId: "test",
    labelKo: "테스트 환경",
    labelEn: "Test environment",
    status: miswired ? "miswired" : isTest && input.runtimeSha ? "ok" : "not_proven",
    statusReason: miswired
      ? "non_prod_wired_to_production_db"
      : isTest
        ? "runtime_self"
        : "not_test_surface",
    url: input.deploymentUrl,
    versionSha: input.runtimeSha,
    deploymentId: (process.env.VERCEL_DEPLOYMENT_ID ?? "").trim() || null,
    deployedAt: null,
    deployState: input.runtimeSha ? "READY_RUNTIME" : null,
    supabaseProjectRef: input.projectRef,
    lastCheckedAt: nowIso(),
    lastError: miswired ? "Preview/TEST must not use Production DB" : null,
    canTest: Boolean(isTest && !miswired && input.runtimeSha),
    canPromoteToProduction: false,
    source: "runtime",
  };
}
