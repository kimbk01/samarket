"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  AdminDeployOpsPanels,
  type DeployOpsPayload,
} from "@/components/admin/deploy/AdminDeployOpsPanels";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import {
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import { adminSafeErrorCode, type AdminLoadFailure } from "@/lib/admin/admin-load-failure";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { adminStatusLabelText } from "@/lib/admin/status-labels/admin-status-label-registry";
import "@/lib/admin/status-labels/pr3-system-a-status-labels";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { formatAdminShortId } from "@/components/admin/ui/AdminTechId";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminServerListFrame } from "@/components/admin/sync-list/AdminServerListFrame";
import { useAdminServerPage } from "@/components/admin/sync-list/useAdminServerPage";
import { translateBy } from "@/lib/i18n/translate-by";

type GateRow = {
  gateId: string;
  required: boolean;
  result: string;
  evidenceId: string | null;
  executedAt: string | null;
  detail: string | null;
};

type StatusPayload = {
  ok: boolean;
  runtimeSha: string | null;
  deployTier: string;
  databaseTarget: string;
  projectRef: string | null;
  bannerVariant: string;
  phase1Layers: string[];
  promoteEnabled: boolean;
  ledgerHydrated?: boolean;
  currentRecord: {
    sha: string;
    status: string;
    verifiedAt?: string | null;
    verifiedBy?: string | null;
    cancelledAt?: string | null;
    promotedAt?: string | null;
    error?: string | null;
    promoteLocked?: boolean;
    promoteLockReason?: string | null;
    updatedAt?: string | null;
    pipeline?: {
      allPass: boolean;
      mode: string;
      stages: Record<string, { state: string; detail?: string; at?: string }>;
    };
  } | null;
  recent: Array<{
    sha: string;
    status: string;
    verifiedAt?: string | null;
    promotedAt?: string | null;
    updatedAt?: string | null;
  }>;
  evidenceMatrix: {
    ok: boolean;
    blocking: Array<{ gateId: string; status: string; reason: string }>;
    matrix: GateRow[];
  } | null;
  actor: {
    userId: string;
    isDeployOwner: boolean;
    deployOwnerConfigured: boolean;
  };
  productionExecution: {
    promote: { allowed: boolean; reason: string; messageKo: string; messageEn: string };
    rollback: { allowed: boolean; reason: string; messageKo: string; messageEn: string };
  };
  auditHistory: Array<{ at: string; sha: string; action: string; detail?: string }>;
  checkedAt?: string;
  statusSemantics?: DeployOpsPayload["statusSemantics"];
  environments?: DeployOpsPayload["environments"];
  changeCompare?: DeployOpsPayload["changeCompare"];
  featureTests?: DeployOpsPayload["featureTests"];
  nativeIdentity?: DeployOpsPayload["nativeIdentity"];
};

type ConfirmKind = "gates" | "verify" | "cancel" | "mock" | "promote" | "rollback";

type OwnerStatusKind =
  | "done"
  | "running"
  | "waiting"
  | "incomplete"
  | "failed"
  | "blocked";

type BoardRow = {
  id: string;
  taskKey: MessageKey;
  taskFallbackKo: string;
  taskFallbackEn: string;
  kind: OwnerStatusKind;
  checkedAt: string | null;
  done: string;
  remaining: string;
  reason: string;
  next: string;
  version: string;
  evidence: string;
};

const STAGE_IDS = [
  "A_github_main",
  "B_vercel_ready",
  "C_domain_aliased",
  "D_prod_smoke",
] as const;

function shortSha(sha: string | null | undefined): string {
  if (!sha) return "—";
  return sha.length > 12 ? sha.slice(0, 12) : sha;
}

function formatAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatAdminManilaDateTime(iso);
}

/**
 * 오류 = 첫 구간(코드)만 화면 문구로 쓴다. 서버 안내 문장(나머지)은 원문이라 화면 본문에 쓰지 않고
 * 접힌 「기술 정보」로만 보여 준다 (R6 — 원문 노출 금지).
 */
function deployErrorParts(error: string): { code: string; detail: string | null } {
  const [code, ...rest] = error.split(" — ");
  return { code: adminSafeErrorCode(code, "save_failed"), detail: rest.length ? error : null };
}

export default function AdminSystemDeployPage() {
  const { safeT, language } = useI18n();
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successHint, setSuccessHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmSha, setConfirmSha] = useState("");
  const [reauthConfirm, setReauthConfirm] = useState("");

  const [loadErr, setLoadErr] = useState<AdminLoadFailure | null>(null);
  /** 상태를 다시 불러올 때마다 이력 쪽도 다시 조회 */
  const [statusVersion, setStatusVersion] = useState(0);

  /** 상태 조회 — 실패(HTTP·네트워크)는 오류 상태 + [새로고침], 403 은 접근 거부 (R6). */
  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/deploy/status", { credentials: "include" });
      const json = (await res.json().catch(() => ({}))) as StatusPayload & { error?: string };
      if (!res.ok || !json.ok) {
        setLoadErr({ code: adminSafeErrorCode(json.error, "load_failed"), httpStatus: res.status });
        return;
      }
      setLoadErr(null);
      setStatus(json);
      setStatusVersion((v) => v + 1);
      if (json.runtimeSha) setConfirmSha(json.runtimeSha);
    } catch {
      setLoadErr({ code: "network_error" });
    }
  }, []);

  const reloadStatus = useCallback(() => {
    setLoadErr(null);
    setStatus(null);
    void load();
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  // 접근표 `action: deploy_owner` (설계 v4 §4-2 #3) — `/me.isDeployOwner` 와 배포 상태 응답이 모두 담당자일 때만 작업 버튼 활성.
  const deployAction = useAdminRouteAction("/admin/system/deploy");
  const isOwner = status?.actor?.isDeployOwner === true && deployAction.allowed;
  const ownerConfigured = status?.actor?.deployOwnerConfigured === true;
  const promoteBlocked = status?.productionExecution?.promote?.allowed !== true;
  const rollbackBlocked = status?.productionExecution?.rollback?.allowed !== true;
  const gatesOk = status?.evidenceMatrix?.ok === true;
  const verified = status?.currentRecord?.status === "verified";
  const runtimeSha = status?.runtimeSha ?? null;
  const isTestSurface =
    status?.bannerVariant === "test" ||
    status?.deployTier === "staging" ||
    status?.databaseTarget === "non_production" ||
    status?.databaseTarget === "isolated_non_prod";

  const blockReason = useMemo(() => {
    if (!ownerConfigured) {
      return safeT("admin_deploy_owner_ids_missing");
    }
    if (!isOwner) {
      return safeT("admin_deploy_owner_only_hint");
    }
    return null;
  }, [ownerConfigured, isOwner, safeT]);

  const labelStatus = useCallback(
    (kind: OwnerStatusKind) => {
      const map: Record<OwnerStatusKind, { ko: string; en: string; key: string }> = {
        done: {
          key: "admin_deploy_status_done",
          ko: "완료",
          en: "Done",
        },
        running: {
          key: "admin_deploy_status_running",
          ko: "진행 중",
          en: "In progress",
        },
        waiting: {
          key: "admin_deploy_status_waiting",
          ko: "확인 대기",
          en: "Awaiting review",
        },
        incomplete: {
          key: "admin_deploy_status_incomplete",
          ko: "미완료",
          en: "Incomplete",
        },
        failed: {
          key: "admin_deploy_status_failed",
          ko: "실패",
          en: "Failed",
        },
        blocked: {
          key: "admin_deploy_status_blocked",
          ko: "실행 차단",
          en: "Blocked",
        },
      };
      const m = map[kind];
      return safeT(m.key as MessageKey, { fallbackKo: m.ko, fallbackEn: m.en });
    },
    [safeT]
  );

  const gateLabel = useCallback(
    (gateId: string) => {
      const fallbacks: Record<string, { key: MessageKey; ko: string; en: string }> = {
        runtime_isolation: {
          key: "admin_deploy_gate_runtime_isolation",
          ko: "테스트·운영 데이터 분리",
          en: "TEST / production data isolation",
        },
        auth_login_profile: {
          key: "admin_deploy_gate_auth_login_profile",
          ko: "로그인·프로필",
          en: "Login & profile",
        },
        test_allowlist_enforced: {
          key: "admin_deploy_gate_test_allowlist_enforced",
          ko: "테스트 접근 허용 목록",
          en: "TEST allowlist",
        },
        messenger_rooms_read: {
          key: "admin_deploy_gate_messenger_rooms_read",
          ko: "메신저 방 목록",
          en: "Messenger room list",
        },
        messenger_send_receive: {
          key: "admin_deploy_gate_messenger_send_receive",
          ko: "메신저 주고받기",
          en: "Messenger send/receive",
        },
        community_trade_write: {
          key: "admin_deploy_gate_community_trade_write",
          ko: "커뮤니티·거래 작성",
          en: "Community / trade write",
        },
        delivery_order_crud: {
          key: "admin_deploy_gate_delivery_order_crud",
          ko: "배달 주문",
          en: "Delivery orders",
        },
        call_push_sms: {
          key: "admin_deploy_gate_call_push_sms",
          ko: "통화·알림·문자",
          en: "Call / push / SMS",
        },
      };
      const fb = fallbacks[gateId];
      if (!fb) return gateId;
      return safeT(fb.key, { fallbackKo: fb.ko, fallbackEn: fb.en });
    },
    [safeT]
  );

  const resultLabel = useCallback(
    (result: string) => {
      if (result === "pass") {
        return safeT("admin_deploy_result_pass");
      }
      if (result === "fail") {
        return safeT("admin_deploy_result_fail");
      }
      return safeT("admin_deploy_result_not_proven");
    },
    [safeT]
  );

  const stageLabel = useCallback(
    (id: string) => {
      const map: Record<string, { key: string; ko: string; en: string }> = {
        A_github_main: {
          key: "admin_deploy_stage_a",
          ko: "버전 준비",
          en: "Version ready",
        },
        B_vercel_ready: {
          key: "admin_deploy_stage_b",
          ko: "배포 완료",
          en: "Deploy finished",
        },
        C_domain_aliased: {
          key: "admin_deploy_stage_c",
          ko: "운영 연결",
          en: "Production linked",
        },
        D_prod_smoke: {
          key: "admin_deploy_stage_d",
          ko: "정상 작동 확인",
          en: "Smoke OK",
        },
      };
      const m = map[id];
      if (!m) return id;
      return safeT(m.key as MessageKey, { fallbackKo: m.ko, fallbackEn: m.en });
    },
    [safeT]
  );

  const boardRows: BoardRow[] = useMemo(() => {
    const sha = shortSha(runtimeSha);
    const matrix = status?.evidenceMatrix?.matrix ?? [];
    const required = matrix.filter((g) => g.required);
    const requiredPass = required.filter((g) => g.result === "pass");
    const requiredFail = required.filter((g) => g.result === "fail");
    const lastGateAt =
      required
        .map((g) => g.executedAt)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null;
    const rec = status?.currentRecord;
    const stages = rec?.pipeline?.stages;
    const stagePass = STAGE_IDS.filter((id) => stages?.[id]?.state === "pass").length;
    const stageFail = STAGE_IDS.some((id) => stages?.[id]?.state === "fail");

    let gatesKind: OwnerStatusKind = "incomplete";
    if (requiredFail.length > 0) gatesKind = "failed";
    else if (rec?.status === "gates_running") gatesKind = "running";
    else if (gatesOk) gatesKind = "done";
    else if (requiredPass.length > 0) gatesKind = "waiting";

    let verifyKind: OwnerStatusKind = "incomplete";
    if (rec?.status === "verified") verifyKind = "done";
    else if (rec?.status === "verify_cancelled") verifyKind = "waiting";
    else if (gatesOk) verifyKind = "waiting";
    else if (requiredFail.length > 0) verifyKind = "failed";

    let pipelineKind: OwnerStatusKind = "incomplete";
    if (stageFail) pipelineKind = "failed";
    else if (rec?.pipeline?.allPass) pipelineKind = "done";
    else if (rec?.pipeline?.mode === "mock_test" || stagePass > 0) pipelineKind = "running";

    const promoteKind: OwnerStatusKind = promoteBlocked
      ? "blocked"
      : rec?.status === "promoted" || rec?.status === "success"
        ? "done"
        : verified
          ? "waiting"
          : "incomplete";

    const rollbackKind: OwnerStatusKind = rollbackBlocked ? "blocked" : "waiting";

    const nextGates = !isOwner
      ? safeT("admin_deploy_next_owner")
      : gatesOk
        ? safeT("admin_deploy_next_verify")
        : safeT("admin_deploy_next_run_gates");

    return [
      {
        id: "gates",
        taskKey: "admin_deploy_task_gates",
        taskFallbackKo: "필수 점검",
        taskFallbackEn: "Required checks",
        kind: gatesKind,
        checkedAt: lastGateAt,
        done: `${requiredPass.length}/${required.length || 3}`,
        remaining: gatesOk
          ? "—"
          : required
              .filter((g) => g.result !== "pass")
              .map((g) => gateLabel(g.gateId))
              .join(", ") || "—",
        reason: requiredFail.map((g) => g.detail || g.gateId).join("; ") || "—",
        next: nextGates,
        version: sha,
        evidence: requiredPass
          .map((g) => formatAdminShortId(g.evidenceId))
          .filter(Boolean)
          .join(", ") || "—",
      },
      {
        id: "verify",
        taskKey: "admin_deploy_task_verify",
        taskFallbackKo: "검증 완료 표시",
        taskFallbackEn: "Mark verified",
        kind: verifyKind,
        checkedAt: rec?.verifiedAt ?? rec?.cancelledAt ?? null,
        done: verified ? formatAt(rec?.verifiedAt) : "—",
        remaining: verified
          ? "—"
          : gatesOk
            ? safeT("admin_deploy_mark_verified")
            : safeT("admin_deploy_task_gates"),
        reason: rec?.error ?? "—",
        next: verified
          ? safeT("admin_deploy_next_promote_blocked")
          : nextGates,
        version: sha,
        evidence: rec?.verifiedBy ? shortSha(rec.verifiedBy) : "—",
      },
      {
        id: "pipeline",
        taskKey: "admin_deploy_task_pipeline",
        taskFallbackKo: "배포 준비 단계",
        taskFallbackEn: "Deploy readiness steps",
        kind: pipelineKind,
        checkedAt: rec?.updatedAt ?? null,
        done: `${stagePass}/4`,
        remaining: STAGE_IDS.filter((id) => stages?.[id]?.state !== "pass")
          .map((id) => stageLabel(id))
          .join(", ") || "—",
        reason: stageFail ? "stage_fail" : "—",
        next:
          translateBy(language, "admin_optional_run_mock_deploy_on_test"),
        version: sha,
        evidence: rec?.pipeline?.mode ?? "—",
      },
      {
        id: "promote",
        taskKey: "admin_deploy_task_promote",
        taskFallbackKo: "실제 운영에 적용",
        taskFallbackEn: "Apply to production",
        kind: promoteKind,
        checkedAt: rec?.promotedAt ?? null,
        done: rec?.promotedAt ? formatAt(rec.promotedAt) : "—",
        remaining: promoteBlocked
          ? safeT("admin_deploy_exec_blocked")
          : "—",
        reason: promoteBlocked
          ? language === "en"
            ? status?.productionExecution.promote.messageEn ??
              status?.productionExecution.promote.reason ??
              "—"
            : status?.productionExecution.promote.messageKo ??
              status?.productionExecution.promote.reason ??
              "—"
          : "—",
        next: safeT("admin_deploy_next_promote_blocked"),
        version: sha,
        evidence: status?.productionExecution.promote.reason ?? "—",
      },
      {
        id: "rollback",
        taskKey: "admin_deploy_task_rollback",
        taskFallbackKo: "이전 정상 버전으로 복구",
        taskFallbackEn: "Rollback to last good",
        kind: rollbackKind,
        checkedAt: null,
        done: "—",
        remaining: safeT("admin_deploy_exec_blocked"),
        reason:
          language === "en"
            ? status?.productionExecution.rollback.messageEn ?? "—"
            : status?.productionExecution.rollback.messageKo ?? "—",
        next: safeT("admin_deploy_promote_disabled_hint"),
        version: sha,
        evidence: status?.productionExecution.rollback.reason ?? "—",
      },
    ];
  }, [
    status,
    runtimeSha,
    gatesOk,
    verified,
    promoteBlocked,
    rollbackBlocked,
    isOwner,
    language,
    safeT,
    gateLabel,
    stageLabel,
  ]);

  async function runRequiredGates() {
    if (!runtimeSha) return;
    setBusy(true);
    setError(null);
    setSuccessHint(null);
    try {
      const required = (status?.evidenceMatrix?.matrix ?? [])
        .filter((g) => g.required)
        .map((g) => g.gateId);
      const ids =
        required.length > 0
          ? required
          : ["runtime_isolation", "auth_login_profile", "test_allowlist_enforced"];
      for (const gateId of ids) {
        const res = await fetch("/api/admin/deploy/run-gate", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sha: runtimeSha, gateId }),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          setError(json.error ?? `gate_${gateId}_${res.status}`);
          return;
        }
      }
      setSuccessHint(
        translateBy(language, "admin_required_checks_finished")
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function markVerified() {
    if (!runtimeSha) return;
    setBusy(true);
    setError(null);
    setSuccessHint(null);
    try {
      const res = await fetch("/api/admin/deploy/mark-verified", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sha: runtimeSha,
          layers: ["web"],
          impactScope: "web_admin_deploy",
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        blocking?: Array<{ gateId: string; reason: string }>;
      };
      if (!res.ok || !json.ok) {
        const extra = json.blocking?.map((b) => `${b.gateId}:${b.reason}`).join(", ");
        setError([json.error ?? `verify_${res.status}`, extra].filter(Boolean).join(" — "));
        return;
      }
      setSuccessHint(translateBy(language, "admin_marked_verified"));
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function cancelVerified() {
    if (!runtimeSha) return;
    setBusy(true);
    setError(null);
    setSuccessHint(null);
    try {
      const res = await fetch("/api/admin/deploy/cancel-verified", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sha: runtimeSha }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? `cancel_${res.status}`);
        return;
      }
      setSuccessHint(translateBy(language, "admin_verified_mark_cancelled"));
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function mockPipeline(allPass: boolean) {
    if (!runtimeSha) return;
    setBusy(true);
    setError(null);
    setSuccessHint(null);
    try {
      const res = await fetch("/api/admin/deploy/mock-pipeline", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sha: runtimeSha, allPass }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? `mock_${res.status}`);
        return;
      }
      setSuccessHint(translateBy(language, "admin_mock_deploy_recorded_test_only"));
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function promoteWeb() {
    if (!runtimeSha) return;
    setBusy(true);
    setError(null);
    setSuccessHint(null);
    try {
      const res = await fetch("/api/admin/deploy/promote-web", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sha: runtimeSha,
          confirmSha,
          reauthConfirm,
          layers: ["web"],
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        ownerAction?: string | null;
      };
      if (!res.ok || !json.ok) {
        setError(
          [json.error ?? `promote_${res.status}`, json.message, json.ownerAction]
            .filter(Boolean)
            .join(" — ")
        );
        return;
      }
      setReauthConfirm("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function rollback() {
    if (!runtimeSha) return;
    setBusy(true);
    setError(null);
    setSuccessHint(null);
    try {
      const res = await fetch("/api/admin/deploy/rollback", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sha: runtimeSha, reauthConfirm: "ROLLBACK" }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      setError(
        [json.error ?? `rollback_${res.status}`, json.message].filter(Boolean).join(" — ")
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  /**
   * 실행 확인 — 자체 확인 모달 대신 표준 확인창(confirmAdminAction) 하나로 (§2.8 확인 단일화).
   * 표시 내용(작업·대상·영향 버전·결과 및 위험)과 단계(확인 1회)는 예전 모달과 같다.
   * 운영 적용의 버전 재입력·PROMOTE 재인증은 화면 입력칸에서 그대로 요구한다.
   */
  const requestConfirm = async (kind: ConfirmKind) => {
    const actionMap: Record<
      ConfirmKind,
      {
        actionKey: MessageKey;
        actionKo: string;
        actionEn: string;
        bodyKey: MessageKey;
        bodyKo: string;
        bodyEn: string;
        target: "test" | "prod";
      }
    > = {
      gates: {
        actionKey: "admin_deploy_run_gates",
        actionKo: "필수 점검 실행",
        actionEn: "Run required checks",
        bodyKey: "admin_deploy_confirm_gates",
        bodyKo: "필수 점검을 서버에서 다시 실행합니다. 테스트 환경 기록만 갱신됩니다.",
        bodyEn: "Re-run required checks on the server. Only TEST records update.",
        target: "test",
      },
      verify: {
        actionKey: "admin_deploy_mark_verified",
        actionKo: "검증 완료",
        actionEn: "Mark verified",
        bodyKey: "admin_deploy_confirm_verify",
        bodyKo: "필수 점검이 완료된 것을 확인하고, 이 버전을 검증 완료로 표시합니다.",
        bodyEn: "Confirm required checks passed and mark this version verified.",
        target: "test",
      },
      cancel: {
        actionKey: "admin_deploy_cancel_verified",
        actionKo: "검증 취소",
        actionEn: "Cancel verified",
        bodyKey: "admin_deploy_confirm_cancel",
        bodyKo: "검증 완료 표시를 취소합니다. 실제 운영에는 영향이 없습니다.",
        bodyEn: "Clear verified mark. Production is not affected.",
        target: "test",
      },
      mock: {
        actionKey: "admin_deploy_mock_pipeline",
        actionKo: "모의 배포 실행",
        actionEn: "Run mock deploy",
        bodyKey: "admin_deploy_confirm_mock",
        bodyKo:
          "테스트 환경에서만 배포 준비 단계를 모의로 표시합니다. 실제 운영·main은 변경되지 않습니다.",
        bodyEn: "Mock readiness steps on TEST only. Production and main are unchanged.",
        target: "test",
      },
      promote: {
        actionKey: "admin_deploy_apply_cta",
        actionKo: "실제 운영에 적용",
        actionEn: "Apply to production",
        bodyKey: "admin_deploy_confirm_promote",
        bodyKo:
          "이 버전을 실제 운영(main)에 적용하려고 합니다. 현재는 실행이 차단되어 실패할 수 있습니다.",
        bodyEn: "Try applying this version to production (main). Currently blocked — may fail.",
        target: "prod",
      },
      rollback: {
        actionKey: "admin_deploy_rollback",
        actionKo: "이전 정상 버전으로 복구",
        actionEn: "Rollback to last good",
        bodyKey: "admin_deploy_confirm_rollback",
        bodyKo:
          "실제 운영을 이전 정상 버전으로 되돌리려고 합니다. 현재는 실행이 차단되어 실패할 수 있습니다.",
        bodyEn: "Try rolling production back. Currently blocked — may fail.",
        target: "prod",
      },
    };
    const meta = actionMap[kind];
    const actionLabel = safeT(meta.actionKey, { fallbackKo: meta.actionKo, fallbackEn: meta.actionEn });
    const targetLabel =
      meta.target === "test"
        ? safeT("admin_deploy_confirm_target_test")
        : safeT("admin_deploy_confirm_target_prod");
    const riskLabel =
      meta.target === "test"
        ? safeT("admin_deploy_confirm_risk_test")
        : safeT("admin_deploy_confirm_risk_prod_blocked");
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko: language !== "en",
      title: safeT("admin_deploy_confirm_title"),
      description: [
        `${safeT("admin_deploy_confirm_action")}: ${actionLabel}`,
        `${safeT("admin_deploy_confirm_target")}: ${targetLabel}`,
        `${safeT("admin_deploy_confirm_version")}: ${runtimeSha ?? "—"}`,
        `${safeT("admin_deploy_confirm_risk")}: ${safeT(meta.bodyKey, {
          fallbackKo: meta.bodyKo,
          fallbackEn: meta.bodyEn,
        })} ${riskLabel}`,
      ].join("\n"),
      confirmLabel: actionLabel,
      destructive: meta.target === "prod",
    });
    if (!confirmed.ok) return;
    if (kind === "gates") void runRequiredGates();
    else if (kind === "verify") void markVerified();
    else if (kind === "cancel") void cancelVerified();
    else if (kind === "mock") void mockPipeline(true);
    else if (kind === "promote") void promoteWeb();
    else void rollback();
  };

  const stages = status?.currentRecord?.pipeline?.stages;

  const statusColor = (kind: OwnerStatusKind) => {
    switch (kind) {
      case "done":
        return "text-sam-success";
      case "running":
        return "text-sam-warning";
      case "waiting":
        return "text-sam-info";
      case "failed":
        return "text-sam-danger";
      case "blocked":
        return "text-sam-warning";
      default:
        return "text-sam-muted";
    }
  };

  if (!status) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        <AdminPageHeader titleKey="admin_menu_system_deploy" />
        {loadErr ? (
          <AdminErrorState
            ko={language !== "en"}
            code={loadErr.code}
            httpStatus={loadErr.httpStatus}
            onRetry={reloadStatus}
          />
        ) : (
          <AdminLoadingState ko={language !== "en"} />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {isTestSurface ? (
            <>
              <span className="rounded-full bg-sam-warning px-2.5 py-0.5 text-xs font-semibold text-white">
                {safeT("admin_deploy_env_badge")}
              </span>
              <span className="rounded-full border border-sam-warning bg-sam-warning-soft px-2.5 py-0.5 text-xs font-medium text-sam-fg">
                {safeT("admin_deploy_env_data_badge")}
              </span>
            </>
          ) : null}
        </div>
        <AdminPageHeader
          titleKey="admin_menu_system_deploy"
          description={safeT("admin_deploy_subtitle")}
        />
      </header>

      <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="text-sm font-semibold text-sam-fg">
          {safeT("admin_deploy_regular_path_title")}
        </h2>
        <p className="text-sm text-sam-muted">
          {safeT("admin_deploy_regular_path_body")}
        </p>
        <p className="text-xs text-sam-muted">
          {safeT("admin_deploy_optional_test_title")}
          {" — "}
          {safeT("admin_deploy_optional_test_body")}
        </p>
      </section>

      {error ? (
        <div>
          <AdminResultBanner
            ko={language !== "en"}
            result={{ ok: false, code: deployErrorParts(error).code }}
            onClose={() => setError(null)}
          />
          {deployErrorParts(error).detail ? (
            <AdminTechDetails ko={language !== "en"}>{deployErrorParts(error).detail}</AdminTechDetails>
          ) : null}
        </div>
      ) : null}
      {loadErr && status ? (
        <AdminErrorState
          ko={language !== "en"}
          code={loadErr.code}
          httpStatus={loadErr.httpStatus}
          onRetry={reloadStatus}
        />
      ) : null}
      {successHint ? (
        <div className="rounded-ui-rect border border-sam-success bg-sam-success-soft px-3 py-2 text-sm text-sam-fg">
          {successHint}
        </div>
      ) : null}

      {promoteBlocked ? (
        <div className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2 text-sm text-sam-fg">
          <p>
            {safeT("admin_deploy_promote_optional_hint")}
          </p>
          <p className="mt-1">
            {language === "en"
              ? status?.productionExecution.promote.messageEn
              : status?.productionExecution.promote.messageKo}
          </p>
          <span className="mt-1 block text-xs text-sam-muted">
            {safeT("admin_deploy_version_hint")}
            : {status?.productionExecution.promote.reason}
          </span>
        </div>
      ) : null}

      {blockReason ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-sm text-sam-muted">
          {blockReason}
        </div>
      ) : null}

      <AdminDeployOpsPanels
        ops={
          status
            ? {
                checkedAt: status.checkedAt,
                statusSemantics: status.statusSemantics,
                environments: status.environments,
                changeCompare: status.changeCompare,
                featureTests: status.featureTests,
                nativeIdentity: status.nativeIdentity,
              }
            : null
        }
      />

      <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-sam-fg">
            {safeT("admin_deploy_runtime")}
          </h2>
          <div className="flex flex-wrap gap-2">
            <AdminActionButton
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setSuccessHint(null);
                void load();
              }}
            >
              {safeT("admin_deploy_refresh")}
            </AdminActionButton>
            <AdminActionButton
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setSuccessHint(null);
                void load();
              }}
            >
              {safeT("admin_deploy_check_test_deploy")}
            </AdminActionButton>
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-sam-muted">
              {safeT("admin_deploy_version_label")}
            </dt>
            <dd className="text-sam-fg">{shortSha(runtimeSha)}</dd>
            <dd className="mt-0.5 break-all font-mono text-[12px] text-sam-muted">
              {runtimeSha ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">
              {safeT("admin_deploy_env_label")}
            </dt>
            <dd className="text-sam-fg">
              {isTestSurface
                ? safeT("admin_deploy_confirm_target_test")
                : safeT("admin_deploy_confirm_target_prod")}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">
              {safeT("admin_deploy_db_label")}
            </dt>
            <dd className="text-sam-fg">
              {status?.databaseTarget ?? "—"}
              {status?.projectRef ? (
                <span className="mt-0.5 block font-mono text-[12px] text-sam-muted">
                  {status.projectRef}
                </span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">
              {safeT("admin_deploy_execution")}
            </dt>
            <dd className="text-sam-fg">
              {status?.promoteEnabled
                ? safeT("admin_deploy_exec_ready")
                : safeT("admin_deploy_exec_blocked")}
            </dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="text-sm font-semibold text-sam-fg">
          {safeT("admin_deploy_status_board")}
        </h2>
        <ul className="space-y-3">
          {boardRows.map((row) => (
            <li
              key={row.id}
              className="rounded-ui-rect border border-sam-border/70 bg-sam-app px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-sam-fg">
                  {safeT(row.taskKey, {
                    fallbackKo: row.taskFallbackKo,
                    fallbackEn: row.taskFallbackEn,
                  })}
                </span>
                <span className={`text-xs font-semibold ${statusColor(row.kind)}`}>
                  {labelStatus(row.kind)}
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-1 gap-1 text-xs text-sam-muted sm:grid-cols-2">
                <div>
                  <dt className="inline text-sam-muted">
                    {safeT("admin_deploy_col_checked_at")}
                    :{" "}
                  </dt>
                  <dd className="inline text-sam-fg">{formatAt(row.checkedAt)}</dd>
                </div>
                <div>
                  <dt className="inline">
                    {safeT("admin_deploy_col_version")}
                    :{" "}
                  </dt>
                  <dd className="inline font-mono text-sam-fg">{row.version}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="inline">
                    {safeT("admin_deploy_col_done")}
                    :{" "}
                  </dt>
                  <dd className="inline text-sam-fg">{row.done}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="inline">
                    {safeT("admin_deploy_col_remaining")}
                    :{" "}
                  </dt>
                  <dd className="inline text-sam-fg">{row.remaining}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="inline">
                    {safeT("admin_deploy_col_reason")}
                    :{" "}
                  </dt>
                  <dd className="inline text-sam-fg">{row.reason}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="inline">
                    {safeT("admin_deploy_col_next")}
                    :{" "}
                  </dt>
                  <dd className="inline text-sam-fg">{row.next}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="inline">
                    {safeT("admin_deploy_col_evidence")}
                    :{" "}
                  </dt>
                  <dd className="inline font-mono text-[12px] text-sam-fg">{row.evidence}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-sam-fg">
            {safeT("admin_deploy_matrix")}
          </h2>
          <AdminActionButton
            variant="secondary"
            disabled={busy || !runtimeSha || !isOwner}
            onClick={() => void requestConfirm("gates")}
          >
            {busy
              ? safeT("admin_deploy_busy")
              : safeT("admin_deploy_run_gates")}
          </AdminActionButton>
        </div>
        <ul className="space-y-2 text-sm">
          {(status?.evidenceMatrix?.matrix ?? []).length === 0 ? (
            <li className="text-sam-muted">—</li>
          ) : (
            status?.evidenceMatrix?.matrix.map((row) => (
              <li
                key={row.gateId}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-sam-border/60 pb-2"
              >
                <span className="text-sam-fg">
                  {gateLabel(row.gateId)}
                  {row.required ? " *" : ""}
                  <span className="ml-2 font-mono text-[12px] text-sam-muted">{row.gateId}</span>
                </span>
                <span
                  className={
                    row.result === "pass"
                      ? "text-sam-success"
                      : row.result === "fail"
                        ? "text-sam-danger"
                        : "text-sam-muted"
                  }
                >
                  {resultLabel(row.result)}
                </span>
                {row.detail ? (
                  <span className="w-full text-xs text-sam-muted">{row.detail}</span>
                ) : null}
              </li>
            ))
          )}
        </ul>
        <p className="text-xs text-sam-muted">
          {safeT("admin_deploy_matrix_note")}
        </p>
      </section>

      <section className="flex flex-wrap gap-2">
        <AdminActionButton
          variant="secondary"
          disabled={busy || !runtimeSha || !isOwner || !gatesOk || verified}
          onClick={() => void requestConfirm("verify")}
        >
          {safeT("admin_deploy_mark_verified")}
        </AdminActionButton>
        <AdminActionButton
          variant="secondary"
          disabled={busy || !runtimeSha || !isOwner || !verified}
          onClick={() => void requestConfirm("cancel")}
        >
          {safeT("admin_deploy_cancel_verified")}
        </AdminActionButton>
        <AdminActionButton
          variant="secondary"
          disabled={busy || !runtimeSha || !isOwner}
          onClick={() => void requestConfirm("mock")}
        >
          {safeT("admin_deploy_mock_pipeline")}
        </AdminActionButton>
      </section>

      <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="text-sm font-semibold text-sam-fg">
          {safeT("admin_deploy_pipeline")}
        </h2>
        <ul className="space-y-1 text-sm">
          {STAGE_IDS.map((id) => {
            const state = stages?.[id]?.state ?? "idle";
            const stateLabel =
              state === "pass"
                ? resultLabel("pass")
                : state === "fail"
                  ? resultLabel("fail")
                  : state === "running"
                    ? labelStatus("running")
                    : labelStatus("incomplete");
            return (
              <li key={id} className="flex justify-between gap-2 text-sm">
                <span>
                  {stageLabel(id)}
                  <span className="ml-2 font-mono text-[12px] text-sam-muted">{id}</span>
                </span>
                <span className={statusColor(state === "pass" ? "done" : state === "fail" ? "failed" : "incomplete")}>
                  {stateLabel}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="text-sm font-semibold text-sam-fg">
          {safeT("admin_deploy_promote_web")}
        </h2>
        <label className="block text-sm">
          <span className="text-sam-muted">
            {safeT("admin_deploy_confirm_sha")}
          </span>
          <input
            className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 font-mono text-sm"
            value={confirmSha}
            onChange={(e) => setConfirmSha(e.target.value.trim())}
            autoComplete="off"
          />
        </label>
        <label className="block text-sm">
          <span className="text-sam-muted">
            {safeT("admin_deploy_reauth")}
          </span>
          <input
            className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 font-mono text-sm"
            value={reauthConfirm}
            onChange={(e) => setReauthConfirm(e.target.value)}
            autoComplete="off"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <AdminActionButton
            variant="primary"
            disabled={
              busy ||
              promoteBlocked ||
              !isOwner ||
              !runtimeSha ||
              !verified ||
              confirmSha !== runtimeSha ||
              reauthConfirm !== "PROMOTE" ||
              status?.currentRecord?.promoteLocked === true
            }
            onClick={() => void requestConfirm("promote")}
          >
            {safeT("admin_deploy_apply_cta")}
          </AdminActionButton>
          <AdminActionButton
            variant="secondary"
            disabled={busy || rollbackBlocked || !isOwner || !runtimeSha}
            onClick={() => void requestConfirm("rollback")}
          >
            {safeT("admin_deploy_rollback")}
          </AdminActionButton>
        </div>
        {promoteBlocked ? (
          <p className="text-xs text-sam-muted">
            {safeT("admin_deploy_promote_disabled_hint")}
          </p>
        ) : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-sam-fg">
          {safeT("admin_deploy_history")}
        </h2>
        <Suspense fallback={null}>
          <DeployHistoryList ko={language !== "en"} refreshSignal={statusVersion} />
        </Suspense>
      </section>

    </div>
  );
}

type DeployHistoryRow = { key: string; at: string; sha: string; label: string; detail: string };

/**
 * 「이력 및 오류 상세」 — 서버 페이지 (`GET /api/admin/deploy/status?part=history`, R7).
 * 고정 상한(감사 30건·최근 20건) 없이 쪽으로 넘긴다. 쪽·크기는 주소에 보존.
 */
function DeployHistoryList({ ko, refreshSignal }: { ko: boolean; refreshSignal: number }) {
  const lq = useAdminListQuery();
  const page = useAdminServerPage<DeployHistoryRow>(
    `/api/admin/deploy/status?part=history&${lq.apiQueryString}`,
    `${lq.refreshKey}#${refreshSignal}`
  );
  return (
    <AdminServerListFrame
      ko={ko}
      state={page}
      page={lq.query.page}
      size={lq.query.size}
      onPageChange={lq.setPage}
      onSizeChange={lq.setSize}
      onRetry={lq.refresh}
    >
      {(rows) => (
        <ul className="space-y-1 text-sm">
          {rows.map((r) => (
            <li key={r.key} className="text-xs text-sam-fg">
              <span className="text-sam-muted">{formatAt(r.at)}</span>
              {" · "}
              <span className="font-mono">{shortSha(r.sha)}</span>
              {" · "}
              {adminStatusLabelText("pr3-system-a.deploy-history", r.label, ko)}
              {r.detail ? ` · ${r.detail}` : ""}
            </li>
          ))}
        </ul>
      )}
    </AdminServerListFrame>
  );
}
