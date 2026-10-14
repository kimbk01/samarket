"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";

type EnvCard = {
  envId: string;
  labelKo: string;
  labelEn: string;
  status: string;
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
  source: string;
};

type ChangeFile = {
  path: string;
  status: string;
  category: string;
  summaryKo: string;
  summaryEn: string;
};

type ChangeCompare = {
  status: string;
  statusReason: string;
  baseSha: string | null;
  headSha: string | null;
  aheadBy: number | null;
  behindBy: number | null;
  commits: number | null;
  files: ChangeFile[];
  hasDbMigration: boolean;
  hasAndroidNative: boolean;
  hasIosNative: boolean;
  hasEnvHint: boolean;
  fetchedAt: string;
};

type FeatureTest = {
  featureId: string;
  labelKo: string;
  labelEn: string;
  method: string;
  platforms: string[];
  versionSha: string | null;
  result: string;
  executed: boolean;
  evidenceId: string | null;
  executedAt: string | null;
  detail: string | null;
  reverifyNeeded: boolean;
  deviceEnv: string;
};

type StatusSemantics = {
  testServerReady: boolean;
  requiredGatesPass: boolean;
  testVerified: boolean;
  mockPipelinePass: boolean;
  productionApplied: boolean;
  webOnlyPhase1: boolean;
  androidProven: boolean;
  iosProven: boolean;
  regularDeployPath?: string;
  notesKo: string[];
  notesEn: string[];
};

type NativeIdentity = {
  production: { appId: string; appName: string };
  test: { appId: string; appName: string };
  iconSeparation: { android: string; ios: string };
  studioHints: { android: string; ios: string };
};

export type DeployOpsPayload = {
  checkedAt?: string;
  statusSemantics?: StatusSemantics;
  environments?: {
    preview: EnvCard;
    test: EnvCard;
    production: EnvCard;
  };
  changeCompare?: ChangeCompare;
  featureTests?: FeatureTest[];
  nativeIdentity?: NativeIdentity;
};

function shortSha(sha: string | null | undefined): string {
  if (!sha) return "—";
  return sha.length > 12 ? sha.slice(0, 12) : sha;
}

function formatAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 19).replace("T", " ");
}

type SafeT = (
  k: MessageKey,
  o: { fallbackKo: string; fallbackEn: string }
) => string;

function statusLabel(status: string, safeT: SafeT): string {
  switch (status) {
    case "ok":
      return safeT("admin_deploy_ops_status_ok", {
        fallbackKo: "정상",
        fallbackEn: "OK",
      });
    case "miswired":
      return safeT("admin_deploy_ops_status_miswired", {
        fallbackKo: "연결 오류",
        fallbackEn: "Miswired",
      });
    case "error":
      return safeT("admin_deploy_ops_status_error", {
        fallbackKo: "오류",
        fallbackEn: "Error",
      });
    case "blocked":
      return safeT("admin_deploy_result_blocked", {
        fallbackKo: "실행할 수 없음",
        fallbackEn: "Blocked",
      });
    default:
      return safeT("admin_deploy_result_not_proven", {
        fallbackKo: "확인되지 않음",
        fallbackEn: "Not proven",
      });
  }
}

function resultLabel(result: string, safeT: SafeT): string {
  if (result === "pass") {
    return safeT("admin_deploy_result_pass", { fallbackKo: "완료", fallbackEn: "Done" });
  }
  if (result === "fail") {
    return safeT("admin_deploy_result_fail", { fallbackKo: "실패", fallbackEn: "Failed" });
  }
  return safeT("admin_deploy_result_not_proven", {
    fallbackKo: "확인되지 않음",
    fallbackEn: "Not proven",
  });
}

function EnvCardView({
  card,
  language,
  safeT,
}: {
  card: EnvCard;
  language: string;
  safeT: SafeT;
}) {
  const title = language === "en" ? card.labelEn : card.labelKo;
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-app p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-sam-fg">{title}</h3>
        <span
          className={
            card.status === "ok"
              ? "text-green-700"
              : card.status === "miswired" || card.status === "error"
                ? "text-red-700"
                : "text-sam-muted"
          }
        >
          {statusLabel(card.status, safeT)}
        </span>
      </div>
      <dl className="mt-2 grid gap-1 text-xs text-sam-muted sm:grid-cols-2">
        <div>
          <dt className="inline text-sam-fg/70">
            {safeT("admin_deploy_ops_url", { fallbackKo: "접속 주소", fallbackEn: "URL" })}
            :{" "}
          </dt>
          <dd className="inline break-all">{card.url ?? "—"}</dd>
        </div>
        <div>
          <dt className="inline text-sam-fg/70">
            {safeT("admin_deploy_version_label", { fallbackKo: "버전 정보", fallbackEn: "Version" })}
            :{" "}
          </dt>
          <dd className="inline font-mono">{shortSha(card.versionSha)}</dd>
        </div>
        <div>
          <dt className="inline text-sam-fg/70">
            {safeT("admin_deploy_ops_deploy_id", {
              fallbackKo: "배포 ID",
              fallbackEn: "Deploy ID",
            })}
            :{" "}
          </dt>
          <dd className="inline font-mono break-all">{card.deploymentId ?? "—"}</dd>
        </div>
        <div>
          <dt className="inline text-sam-fg/70">
            {safeT("admin_deploy_ops_deployed_at", {
              fallbackKo: "배포 일시",
              fallbackEn: "Deployed at",
            })}
            :{" "}
          </dt>
          <dd className="inline">{formatAt(card.deployedAt)}</dd>
        </div>
        <div>
          <dt className="inline text-sam-fg/70">
            {safeT("admin_deploy_ops_deploy_state", {
              fallbackKo: "배포 상태",
              fallbackEn: "Deploy state",
            })}
            :{" "}
          </dt>
          <dd className="inline">{card.deployState ?? "—"}</dd>
        </div>
        <div>
          <dt className="inline text-sam-fg/70">
            {safeT("admin_deploy_ops_supabase", {
              fallbackKo: "연결된 DB",
              fallbackEn: "Supabase",
            })}
            :{" "}
          </dt>
          <dd className="inline font-mono">{card.supabaseProjectRef ?? "—"}</dd>
        </div>
        <div>
          <dt className="inline text-sam-fg/70">
            {safeT("admin_deploy_ops_checked_at", {
              fallbackKo: "최근 확인",
              fallbackEn: "Last checked",
            })}
            :{" "}
          </dt>
          <dd className="inline">{formatAt(card.lastCheckedAt)}</dd>
        </div>
        <div>
          <dt className="inline text-sam-fg/70">
            {safeT("admin_deploy_ops_last_error", {
              fallbackKo: "마지막 오류",
              fallbackEn: "Last error",
            })}
            :{" "}
          </dt>
          <dd className="inline text-red-700/90">{card.lastError ?? "—"}</dd>
        </div>
        <div>
          <dt className="inline text-sam-fg/70">
            {safeT("admin_deploy_ops_can_test", {
              fallbackKo: "테스트 가능",
              fallbackEn: "Can test",
            })}
            :{" "}
          </dt>
          <dd className="inline">{card.canTest ? "Y" : "N"}</dd>
        </div>
        <div>
          <dt className="inline text-sam-fg/70">
            {safeT("admin_deploy_ops_can_promote", {
              fallbackKo: "운영 적용 가능",
              fallbackEn: "Can apply to prod",
            })}
            :{" "}
          </dt>
          <dd className="inline">{card.canPromoteToProduction ? "Y" : "N"}</dd>
        </div>
      </dl>
      <p className="mt-2 text-[11px] text-sam-muted">
        {safeT("admin_deploy_ops_source", { fallbackKo: "조회 원천", fallbackEn: "Source" })}:{" "}
        {card.source} · {card.statusReason}
      </p>
    </div>
  );
}

export function AdminDeployOpsPanels({ ops }: { ops: DeployOpsPayload | null }) {
  const { safeT, language } = useI18n();
  if (!ops?.environments && !ops?.changeCompare && !ops?.featureTests) {
    return null;
  }

  const envs = ops.environments;
  const compare = ops.changeCompare;
  const features = ops.featureTests ?? [];
  const native = ops.nativeIdentity;
  const semantics = ops.statusSemantics;
  const added = compare?.files.filter((f) => f.status === "added") ?? [];
  const modified = compare?.files.filter((f) => f.status === "modified" || f.status === "changed") ?? [];
  const removed = compare?.files.filter((f) => f.status === "removed") ?? [];

  return (
    <div className="space-y-6">
      {semantics ? (
        <section className="space-y-2 rounded-ui-rect border border-amber-300/60 bg-amber-50/60 p-4">
          <h2 className="text-sm font-semibold text-sam-fg">
            {safeT("admin_deploy_ops_semantics_title", {
              fallbackKo: "완료 의미 구분 (합치지 않음)",
              fallbackEn: "Do not merge different “done” meanings",
            })}
          </h2>
          {semantics.regularDeployPath ? (
            <p className="text-xs font-medium text-amber-950">
              {safeT("admin_deploy_regular_path_title", {
                fallbackKo: "정규 배포 경로",
                fallbackEn: "Regular deploy path",
              })}
              : {semantics.regularDeployPath}
            </p>
          ) : null}
          <ul className="list-inside list-disc space-y-1 text-xs text-amber-950">
            {(language === "en" ? semantics.notesEn : semantics.notesKo).map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
            <div>
              {safeT("admin_deploy_ops_sem_test_ready", {
                fallbackKo: "테스트 서버 응답",
                fallbackEn: "TEST server ready",
              })}
              : {semantics.testServerReady ? "Y" : "N"}
            </div>
            <div>
              {safeT("admin_deploy_ops_sem_gates", {
                fallbackKo: "필수 점검 통과",
                fallbackEn: "Required gates pass",
              })}
              : {semantics.requiredGatesPass ? "Y" : "N"}
            </div>
            <div>
              {safeT("admin_deploy_ops_sem_verified", {
                fallbackKo: "테스트 검증 표시",
                fallbackEn: "TEST verified mark",
              })}
              : {semantics.testVerified ? "Y" : "N"}
            </div>
            <div>
              {safeT("admin_deploy_ops_sem_mock", {
                fallbackKo: "모의 배포 PASS",
                fallbackEn: "Mock pipeline PASS",
              })}
              : {semantics.mockPipelinePass ? "Y" : "N"}
            </div>
            <div>
              {safeT("admin_deploy_ops_sem_prod", {
                fallbackKo: "실제 운영 적용",
                fallbackEn: "Production applied",
              })}
              : {semantics.productionApplied ? "Y" : "N (BLOCKED)"}
            </div>
            <div>
              Android / iOS 실측:{" "}
              {semantics.androidProven ? "Android Y" : "Android N"} /{" "}
              {semantics.iosProven ? "iOS Y" : "iOS N"}
            </div>
          </dl>
        </section>
      ) : null}

      {envs ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-sm font-semibold text-sam-fg">
              {safeT("admin_deploy_ops_env_title", {
                fallbackKo: "환경 · 실시간 서버",
                fallbackEn: "Environments · live servers",
              })}
            </h2>
            <p className="text-[11px] text-sam-muted">
              {safeT("admin_deploy_ops_checked_at", {
                fallbackKo: "최근 확인",
                fallbackEn: "Last checked",
              })}
              : {formatAt(ops.checkedAt)}
            </p>
          </div>
          <div className="grid gap-3">
            <EnvCardView card={envs.production} language={language} safeT={safeT} />
            <EnvCardView card={envs.test} language={language} safeT={safeT} />
            <EnvCardView card={envs.preview} language={language} safeT={safeT} />
          </div>
          <p className="text-[11px] text-sam-muted">
            {safeT("admin_deploy_optional_test_body", {
              fallbackKo:
                "TEST 서버·DB·앱은 보존되어 있습니다. Owner가 필요할 때만 사용합니다. 정규 Production 배포가 TEST에 의존하지 않습니다.",
              fallbackEn:
                "TEST server/DB/app are preserved for Owner use when needed. Regular Production does not depend on TEST.",
            })}
          </p>
        </section>
      ) : null}

      {compare ? (
        <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="text-sm font-semibold text-sam-fg">
            {safeT("admin_deploy_ops_change_title", {
              fallbackKo: "운영 대비 변경 내용",
              fallbackEn: "Changes vs production",
            })}
          </h2>
          <p className="text-xs text-sam-muted">
            {safeT("admin_deploy_ops_change_note", {
              fallbackKo:
                "운영 적용 대상은 테스트에서 검증한 버전 전체입니다. 파일 단위로 골라 올리지 않습니다.",
              fallbackEn:
                "Production apply is the whole TEST-verified version — not cherry-picked files.",
            })}
          </p>
          <dl className="grid gap-1 text-xs sm:grid-cols-2">
            <div>
              {safeT("admin_deploy_ops_base", { fallbackKo: "운영 버전", fallbackEn: "Production" })}
              : <span className="font-mono">{shortSha(compare.baseSha)}</span>
            </div>
            <div>
              {safeT("admin_deploy_ops_head", { fallbackKo: "테스트 버전", fallbackEn: "TEST" })}
              : <span className="font-mono">{shortSha(compare.headSha)}</span>
            </div>
            <div>
              ahead: {compare.aheadBy ?? "—"} · behind: {compare.behindBy ?? "—"} · commits:{" "}
              {compare.commits ?? "—"}
            </div>
            <div>
              {statusLabel(compare.status, safeT)} ({compare.statusReason})
            </div>
          </dl>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {compare.hasDbMigration ? (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-800">
                {safeT("admin_deploy_ops_flag_db", {
                  fallbackKo: "DB·마이그레이션 — 별도 승인",
                  fallbackEn: "DB/migration — separate approval",
                })}
              </span>
            ) : null}
            {compare.hasAndroidNative ? (
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-orange-900">
                Android 네이티브
              </span>
            ) : null}
            {compare.hasIosNative ? (
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-orange-900">iOS 네이티브</span>
            ) : null}
            {compare.hasEnvHint ? (
              <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-yellow-900">
                {safeT("admin_deploy_ops_flag_env", {
                  fallbackKo: "환경변수 변경 가능",
                  fallbackEn: "Env change possible",
                })}
              </span>
            ) : null}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {(
              [
                ["added", added],
                ["modified", modified],
                ["removed", removed],
              ] as const
            ).map(([kind, rows]) => (
              <div key={kind} className="rounded-ui-rect border border-sam-border bg-sam-app p-2">
                <h3 className="text-xs font-semibold text-sam-fg">
                  {kind === "added"
                    ? safeT("admin_deploy_ops_files_added", {
                        fallbackKo: "추가된 파일",
                        fallbackEn: "Added",
                      })
                    : kind === "removed"
                      ? safeT("admin_deploy_ops_files_removed", {
                          fallbackKo: "삭제된 파일",
                          fallbackEn: "Removed",
                        })
                      : safeT("admin_deploy_ops_files_modified", {
                          fallbackKo: "수정된 파일",
                          fallbackEn: "Modified",
                        })}{" "}
                  ({rows.length})
                </h3>
                <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-[11px] text-sam-muted">
                  {rows.length === 0 ? (
                    <li>—</li>
                  ) : (
                    rows.slice(0, 80).map((f) => (
                      <li key={`${kind}-${f.path}`} title={language === "en" ? f.summaryEn : f.summaryKo}>
                        <span className="text-sam-fg/80">[{f.category}]</span> {f.path}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {features.length > 0 ? (
        <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="text-sm font-semibold text-sam-fg">
            {safeT("admin_deploy_ops_feature_title", {
              fallbackKo: "기능별 테스트 현황",
              fallbackEn: "Feature test status",
            })}
          </h2>
          <p className="text-xs text-sam-muted">
            {safeT("admin_deploy_ops_feature_note", {
              fallbackKo:
                "자동 점검과 실기기 확인을 구분합니다. 실행하지 않은 실기기 항목은 「확인되지 않음」입니다.",
              fallbackEn:
                "Automated gates vs device checks stay separate. Unrun device tests stay Not proven.",
            })}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-sam-border text-sam-muted">
                  <th className="py-1 pr-2 font-medium">
                    {safeT("admin_deploy_col_task", { fallbackKo: "작업", fallbackEn: "Task" })}
                  </th>
                  <th className="py-1 pr-2 font-medium">
                    {safeT("admin_deploy_ops_method", {
                      fallbackKo: "방법",
                      fallbackEn: "Method",
                    })}
                  </th>
                  <th className="py-1 pr-2 font-medium">
                    {safeT("admin_deploy_col_state", { fallbackKo: "현재 상태", fallbackEn: "Status" })}
                  </th>
                  <th className="py-1 pr-2 font-medium">
                    {safeT("admin_deploy_ops_device", {
                      fallbackKo: "기기·환경",
                      fallbackEn: "Device / env",
                    })}
                  </th>
                  <th className="py-1 pr-2 font-medium">
                    {safeT("admin_deploy_col_evidence", {
                      fallbackKo: "확인 기록",
                      fallbackEn: "Evidence",
                    })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {features.map((f) => (
                  <tr key={f.featureId} className="border-b border-sam-border/60 align-top">
                    <td className="py-1.5 pr-2 text-sam-fg">
                      {language === "en" ? f.labelEn : f.labelKo}
                      <div className="text-[10px] text-sam-muted">{f.platforms.join(", ")}</div>
                    </td>
                    <td className="py-1.5 pr-2 text-sam-muted">
                      {f.method === "automated_gate"
                        ? safeT("admin_deploy_ops_method_auto", {
                            fallbackKo: "자동 점검",
                            fallbackEn: "Automated",
                          })
                        : f.method === "manual_device"
                          ? safeT("admin_deploy_ops_method_device", {
                              fallbackKo: "실기기",
                              fallbackEn: "Device",
                            })
                          : safeT("admin_deploy_ops_method_manual", {
                              fallbackKo: "수동 웹",
                              fallbackEn: "Manual web",
                            })}
                    </td>
                    <td
                      className={
                        f.result === "pass"
                          ? "py-1.5 pr-2 text-green-700"
                          : f.result === "fail"
                            ? "py-1.5 pr-2 text-red-700"
                            : "py-1.5 pr-2 text-sam-muted"
                      }
                    >
                      {resultLabel(f.result, safeT)}
                      {f.reverifyNeeded ? (
                        <div className="text-[10px] text-amber-800">
                          {safeT("admin_deploy_ops_reverify", {
                            fallbackKo: "재검증 필요",
                            fallbackEn: "Reverify needed",
                          })}
                        </div>
                      ) : null}
                      {f.detail ? <div className="text-[10px] text-sam-muted">{f.detail}</div> : null}
                    </td>
                    <td className="py-1.5 pr-2 text-sam-muted">{f.deviceEnv}</td>
                    <td className="py-1.5 pr-2 font-mono text-[10px] text-sam-muted">
                      {f.evidenceId ? shortSha(f.evidenceId) : "—"}
                      <div>{formatAt(f.executedAt)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {native ? (
        <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="text-sm font-semibold text-sam-fg">
            {safeT("admin_deploy_ops_native_title", {
              fallbackKo: "Android Studio / Xcode",
              fallbackEn: "Android Studio / Xcode",
            })}
          </h2>
          <p className="text-xs text-sam-muted">
            {safeT("admin_deploy_ops_native_note", {
              fallbackKo:
                "웹 서버 배포와 앱 스토어 빌드는 별도 절차입니다. 빌드 상태가 자동 수집되지 않으면 「확인되지 않음」입니다.",
              fallbackEn:
                "Web deploy ≠ store builds. Without automated build telemetry, status stays Not proven.",
            })}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-ui-rect border border-sam-border bg-sam-app p-3 text-xs">
              <h3 className="font-semibold text-sam-fg">Android</h3>
              <p>
                {native.production.appName}: <span className="font-mono">{native.production.appId}</span>
              </p>
              <p>
                {native.test.appName}: <span className="font-mono">{native.test.appId}</span>
              </p>
              <p className="mt-1 text-sam-muted">
                아이콘: {native.iconSeparation.android}
              </p>
              <p className="mt-1 break-all text-sam-muted">{native.studioHints.android}</p>
            </div>
            <div className="rounded-ui-rect border border-sam-border bg-sam-app p-3 text-xs">
              <h3 className="font-semibold text-sam-fg">iOS</h3>
              <p>
                {native.production.appName}: <span className="font-mono">{native.production.appId}</span>
              </p>
              <p>
                {native.test.appName}: <span className="font-mono">{native.test.appId}</span>
              </p>
              <p className="mt-1 text-sam-muted">아이콘: {native.iconSeparation.ios}</p>
              <p className="mt-1 break-all text-sam-muted">{native.studioHints.ios}</p>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
