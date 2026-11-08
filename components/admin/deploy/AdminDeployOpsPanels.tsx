"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

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
  return formatAdminManilaDateTime(iso);
}

/** `useI18n().safeT` 와 같은 모양 — 대체 문구는 선택 */
type SafeT = (
  k: MessageKey,
  o?: { fallbackKo?: string; fallbackEn?: string }
) => string;

function statusLabel(status: string, safeT: SafeT): string {
  switch (status) {
    case "ok":
      return safeT("admin_deploy_ops_status_ok");
    case "miswired":
      return safeT("admin_deploy_ops_status_miswired");
    case "error":
      return safeT("admin_deploy_ops_status_error");
    case "blocked":
      return safeT("admin_deploy_result_blocked");
    default:
      return safeT("admin_deploy_result_not_proven");
  }
}

function resultLabel(result: string, safeT: SafeT): string {
  if (result === "pass") {
    return safeT("admin_deploy_result_pass");
  }
  if (result === "fail") {
    return safeT("admin_deploy_result_fail");
  }
  return safeT("admin_deploy_result_not_proven");
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
              ? "text-sam-success"
              : card.status === "miswired" || card.status === "error"
                ? "text-sam-danger"
                : "text-sam-muted"
          }
        >
          {statusLabel(card.status, safeT)}
        </span>
      </div>
      <dl className="mt-2 grid gap-1 text-xs text-sam-muted sm:grid-cols-2">
        <div>
          <dt className="inline text-sam-fg/70">
            {safeT("admin_deploy_ops_url")}
            :{" "}
          </dt>
          <dd className="inline break-all">{card.url ?? "—"}</dd>
        </div>
        <div>
          <dt className="inline text-sam-fg/70">
            {safeT("admin_deploy_version_label")}
            :{" "}
          </dt>
          <dd className="inline font-mono">{shortSha(card.versionSha)}</dd>
        </div>
        <div>
          <dt className="inline text-sam-fg/70">
            {safeT("admin_deploy_ops_deploy_id")}
            :{" "}
          </dt>
          <dd className="inline font-mono break-all">{card.deploymentId ?? "—"}</dd>
        </div>
        <div>
          <dt className="inline text-sam-fg/70">
            {safeT("admin_deploy_ops_deployed_at")}
            :{" "}
          </dt>
          <dd className="inline">{formatAt(card.deployedAt)}</dd>
        </div>
        <div>
          <dt className="inline text-sam-fg/70">
            {safeT("admin_deploy_ops_deploy_state")}
            :{" "}
          </dt>
          <dd className="inline">{card.deployState ?? "—"}</dd>
        </div>
        <div>
          <dt className="inline text-sam-fg/70">
            {safeT("admin_deploy_ops_supabase")}
            :{" "}
          </dt>
          <dd className="inline font-mono">{card.supabaseProjectRef ?? "—"}</dd>
        </div>
        <div>
          <dt className="inline text-sam-fg/70">
            {safeT("admin_deploy_ops_checked_at")}
            :{" "}
          </dt>
          <dd className="inline">{formatAt(card.lastCheckedAt)}</dd>
        </div>
        <div>
          <dt className="inline text-sam-fg/70">
            {safeT("admin_deploy_ops_last_error")}
            :{" "}
          </dt>
          <dd className="inline text-sam-danger">{card.lastError ?? "—"}</dd>
        </div>
        <div>
          <dt className="inline text-sam-fg/70">
            {safeT("admin_deploy_ops_can_test")}
            :{" "}
          </dt>
          <dd className="inline">{card.canTest ? "Y" : "N"}</dd>
        </div>
        <div>
          <dt className="inline text-sam-fg/70">
            {safeT("admin_deploy_ops_can_promote")}
            :{" "}
          </dt>
          <dd className="inline">{card.canPromoteToProduction ? "Y" : "N"}</dd>
        </div>
      </dl>
      <p className="mt-2 text-[12px] text-sam-muted">
        {safeT("admin_deploy_ops_source")}:{" "}
        {card.source} · {card.statusReason}
      </p>
    </div>
  );
}

export function AdminDeployOpsPanels({ ops }: { ops: DeployOpsPayload | null }) {
  const { t, safeT, language } = useI18n();
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
        <section className="space-y-2 rounded-ui-rect border border-sam-warning bg-sam-warning-soft p-4">
          <h2 className="text-sm font-semibold text-sam-fg">
            {safeT("admin_deploy_ops_semantics_title")}
          </h2>
          {semantics.regularDeployPath ? (
            <p className="text-xs font-medium text-sam-fg">
              {safeT("admin_deploy_regular_path_title")}
              : {semantics.regularDeployPath}
            </p>
          ) : null}
          <ul className="list-inside list-disc space-y-1 text-xs text-sam-fg">
            {(language === "en" ? semantics.notesEn : semantics.notesKo).map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
            <div>
              {safeT("admin_deploy_ops_sem_test_ready")}
              : {semantics.testServerReady ? "Y" : "N"}
            </div>
            <div>
              {safeT("admin_deploy_ops_sem_gates")}
              : {semantics.requiredGatesPass ? "Y" : "N"}
            </div>
            <div>
              {safeT("admin_deploy_ops_sem_verified")}
              : {semantics.testVerified ? "Y" : "N"}
            </div>
            <div>
              {safeT("admin_deploy_ops_sem_mock")}
              : {semantics.mockPipelinePass ? "Y" : "N"}
            </div>
            <div>
              {safeT("admin_deploy_ops_sem_prod")}
              : {semantics.productionApplied ? "Y" : "N (BLOCKED)"}
            </div>
            <div>
              {safeT("admin_deploy_android_ios_device_proven")}{" "}
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
              {safeT("admin_deploy_ops_env_title")}
            </h2>
            <p className="text-[12px] text-sam-muted">
              {safeT("admin_deploy_ops_checked_at")}
              : {formatAt(ops.checkedAt)}
            </p>
          </div>
          <div className="grid gap-3">
            <EnvCardView card={envs.production} language={language} safeT={safeT} />
            <EnvCardView card={envs.test} language={language} safeT={safeT} />
            <EnvCardView card={envs.preview} language={language} safeT={safeT} />
          </div>
          <p className="text-[12px] text-sam-muted">
            {safeT("admin_deploy_optional_test_body")}
          </p>
        </section>
      ) : null}

      {compare ? (
        <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="text-sm font-semibold text-sam-fg">
            {safeT("admin_deploy_ops_change_title")}
          </h2>
          <p className="text-xs text-sam-muted">
            {safeT("admin_deploy_ops_change_note")}
          </p>
          <dl className="grid gap-1 text-xs sm:grid-cols-2">
            <div>
              {safeT("admin_deploy_ops_base")}
              : <span className="font-mono">{shortSha(compare.baseSha)}</span>
            </div>
            <div>
              {safeT("admin_deploy_ops_head")}
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
              <span className="rounded-full bg-sam-danger-soft px-2 py-0.5 text-sam-danger">
                {safeT("admin_deploy_ops_flag_db")}
              </span>
            ) : null}
            {compare.hasAndroidNative ? (
              <span className="rounded-full bg-sam-warning-soft px-2 py-0.5 text-sam-warning">
                {safeT("admin_deploy_android_native")}
              </span>
            ) : null}
            {compare.hasIosNative ? (
              <span className="rounded-full bg-sam-warning-soft px-2 py-0.5 text-sam-warning">
                {safeT("admin_deploy_ios_native")}
              </span>
            ) : null}
            {compare.hasEnvHint ? (
              <span className="rounded-full bg-sam-warning-soft px-2 py-0.5 text-sam-warning">
                {safeT("admin_deploy_ops_flag_env")}
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
                    ? safeT("admin_deploy_ops_files_added")
                    : kind === "removed"
                      ? safeT("admin_deploy_ops_files_removed")
                      : safeT("admin_deploy_ops_files_modified")}{" "}
                  ({rows.length})
                </h3>
                <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-[12px] text-sam-muted">
                  {rows.length === 0 ? (
                    <li>—</li>
                  ) : (
                    rows.map((f) => (
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
            {safeT("admin_deploy_ops_feature_title")}
          </h2>
          <p className="text-xs text-sam-muted">
            {safeT("admin_deploy_ops_feature_note")}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-sam-border text-sam-muted">
                  <th className="py-1 pr-2 font-medium">
                    {safeT("admin_deploy_col_task")}
                  </th>
                  <th className="py-1 pr-2 font-medium">
                    {safeT("admin_deploy_ops_method")}
                  </th>
                  <th className="py-1 pr-2 font-medium">
                    {safeT("admin_deploy_col_state")}
                  </th>
                  <th className="py-1 pr-2 font-medium">
                    {safeT("admin_deploy_ops_device")}
                  </th>
                  <th className="py-1 pr-2 font-medium">
                    {safeT("admin_deploy_col_evidence")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {features.map((f) => (
                  <tr key={f.featureId} className="border-b border-sam-border/60 align-top">
                    <td className="py-1.5 pr-2 text-sam-fg">
                      {language === "en" ? f.labelEn : f.labelKo}
                      <div className="text-[12px] text-sam-muted">{f.platforms.join(", ")}</div>
                    </td>
                    <td className="py-1.5 pr-2 text-sam-muted">
                      {f.method === "automated_gate"
                        ? safeT("admin_deploy_ops_method_auto")
                        : f.method === "manual_device"
                          ? safeT("admin_deploy_ops_method_device")
                          : safeT("admin_deploy_ops_method_manual")}
                    </td>
                    <td
                      className={
                        f.result === "pass"
                          ? "py-1.5 pr-2 text-sam-success"
                          : f.result === "fail"
                            ? "py-1.5 pr-2 text-sam-danger"
                            : "py-1.5 pr-2 text-sam-muted"
                      }
                    >
                      {resultLabel(f.result, safeT)}
                      {f.reverifyNeeded ? (
                        <div className="text-[12px] text-sam-warning">
                          {safeT("admin_deploy_ops_reverify")}
                        </div>
                      ) : null}
                      {f.detail ? <div className="text-[12px] text-sam-muted">{f.detail}</div> : null}
                    </td>
                    <td className="py-1.5 pr-2 text-sam-muted">{f.deviceEnv}</td>
                    <td className="py-1.5 pr-2 font-mono text-[12px] text-sam-muted">
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
            {safeT("admin_deploy_ops_native_title")}
          </h2>
          <p className="text-xs text-sam-muted">
            {safeT("admin_deploy_ops_native_note")}
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
                {t("admin_deploy_icon_value", { value: native.iconSeparation.android })}
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
              <p className="mt-1 text-sam-muted">{t("admin_deploy_icon_value", { value: native.iconSeparation.ios })}</p>
              <p className="mt-1 break-all text-sam-muted">{native.studioHints.ios}</p>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
