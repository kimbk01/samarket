"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { Sam } from "@/lib/ui/css-vars";

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
  return iso.slice(0, 19).replace("T", " ");
}

export default function AdminSystemDeployPage() {
  const { safeT, language } = useI18n();
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successHint, setSuccessHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmSha, setConfirmSha] = useState("");
  const [reauthConfirm, setReauthConfirm] = useState("");
  const [confirmOpen, setConfirmOpen] = useState<ConfirmKind | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/admin/deploy/status", { credentials: "include" });
    const json = (await res.json()) as StatusPayload & { error?: string };
    if (!res.ok || !json.ok) {
      setError(json.error ?? `status_${res.status}`);
      return;
    }
    setStatus(json);
    if (json.runtimeSha) setConfirmSha(json.runtimeSha);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isOwner = status?.actor?.isDeployOwner === true;
  const ownerConfigured = status?.actor?.deployOwnerConfigured === true;
  const promoteBlocked = status?.productionExecution?.promote?.allowed !== true;
  const rollbackBlocked = status?.productionExecution?.rollback?.allowed !== true;
  const gatesOk = status?.evidenceMatrix?.ok === true;
  const verified = status?.currentRecord?.status === "verified";
  const runtimeSha = status?.runtimeSha ?? null;
  const isTestSurface =
    status?.bannerVariant === "test" ||
    status?.deployTier === "staging" ||
    status?.databaseTarget === "isolated_non_prod";

  const blockReason = useMemo(() => {
    if (!ownerConfigured) {
      return safeT("admin_deploy_owner_ids_missing", {
        fallbackKo: "담당자 목록이 설정되지 않아 실행이 막혀 있습니다.",
        fallbackEn: "Owner list is unset — actions stay blocked.",
      });
    }
    if (!isOwner) {
      return safeT("admin_deploy_owner_only_hint", {
        fallbackKo: "지정된 담당자만 검증·적용을 실행할 수 있습니다.",
        fallbackEn: "Only the designated Owner can verify or apply.",
      });
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
        return safeT("admin_deploy_result_pass", { fallbackKo: "완료", fallbackEn: "Done" });
      }
      if (result === "fail") {
        return safeT("admin_deploy_result_fail", { fallbackKo: "실패", fallbackEn: "Failed" });
      }
      return safeT("admin_deploy_result_not_proven", {
        fallbackKo: "확인되지 않음",
        fallbackEn: "Not proven",
      });
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
      ? safeT("admin_deploy_next_owner", {
          fallbackKo: "지정 담당자로 로그인한 뒤 다시 시도하세요.",
          fallbackEn: "Sign in as the designated Owner and retry.",
        })
      : gatesOk
        ? safeT("admin_deploy_next_verify", {
            fallbackKo: "필수 점검이 끝났습니다. 「검증 완료」를 눌러 주세요.",
            fallbackEn: "Checks finished. Tap “Mark verified”.",
          })
        : safeT("admin_deploy_next_run_gates", {
            fallbackKo: "「필수 점검 실행」을 눌러 확인 기록을 만드세요.",
            fallbackEn: "Tap “Run required checks” to create evidence.",
          });

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
          .map((g) => g.evidenceId?.slice(0, 8))
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
            ? safeT("admin_deploy_mark_verified", {
                fallbackKo: "검증 완료",
                fallbackEn: "Mark verified",
              })
            : safeT("admin_deploy_task_gates", {
                fallbackKo: "필수 점검",
                fallbackEn: "Required checks",
              }),
        reason: rec?.error ?? "—",
        next: verified
          ? safeT("admin_deploy_next_promote_blocked", {
              fallbackKo:
                "검증은 끝났지만 실제 운영 적용은 아직 실행할 수 없습니다. Owner 승인(Area B)이 필요합니다.",
              fallbackEn:
                "Verified, but production apply is still blocked. Area B Owner approval required.",
            })
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
          language === "en"
            ? "Optional: run mock deploy on TEST"
            : "선택: 테스트에서 모의 배포 실행",
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
          ? safeT("admin_deploy_exec_blocked", {
              fallbackKo: "실행할 수 없음",
              fallbackEn: "Cannot run",
            })
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
        next: safeT("admin_deploy_next_promote_blocked", {
          fallbackKo:
            "검증은 끝났지만 실제 운영 적용은 아직 실행할 수 없습니다. Owner 승인(Area B)이 필요합니다.",
          fallbackEn:
            "Verified, but production apply is still blocked. Area B Owner approval required.",
        }),
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
        remaining: safeT("admin_deploy_exec_blocked", {
          fallbackKo: "실행할 수 없음",
          fallbackEn: "Cannot run",
        }),
        reason:
          language === "en"
            ? status?.productionExecution.rollback.messageEn ?? "—"
            : status?.productionExecution.rollback.messageKo ?? "—",
        next: safeT("admin_deploy_promote_disabled_hint", {
          fallbackKo:
            "실제 운영 적용·복구는 서버에서도 막혀 있습니다. (Area B — 별도 승인 필요)",
          fallbackEn:
            "Production apply/rollback stay server-blocked (Area B — separate approval).",
        }),
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
    setConfirmOpen(null);
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
        language === "en" ? "Required checks finished." : "필수 점검을 마쳤습니다."
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
    setConfirmOpen(null);
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
      setSuccessHint(language === "en" ? "Marked verified." : "검증 완료로 표시했습니다.");
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
    setConfirmOpen(null);
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
      setSuccessHint(language === "en" ? "Verified mark cancelled." : "검증 완료를 취소했습니다.");
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
    setConfirmOpen(null);
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
      setSuccessHint(language === "en" ? "Mock deploy recorded (TEST only)." : "모의 배포를 기록했습니다 (테스트만).");
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
    setConfirmOpen(null);
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
    setConfirmOpen(null);
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

  const confirmMeta = useMemo(() => {
    if (!confirmOpen) return null;
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
    return actionMap[confirmOpen];
  }, [confirmOpen]);

  const historyRows = useMemo(() => {
    const audit = status?.auditHistory ?? [];
    if (audit.length > 0) return audit.map((r) => ({
      key: `${r.sha}-${r.action}-${r.at}`,
      at: r.at,
      sha: r.sha,
      label: r.action,
      detail: r.detail ?? "",
    }));
    return (status?.recent ?? []).map((r) => ({
      key: `${r.sha}-${r.status}-${r.verifiedAt ?? r.updatedAt ?? ""}`,
      at: r.verifiedAt ?? r.promotedAt ?? r.updatedAt ?? "",
      sha: r.sha,
      label: r.status,
      detail: "",
    }));
  }, [status]);

  const stages = status?.currentRecord?.pipeline?.stages;

  const statusColor = (kind: OwnerStatusKind) => {
    switch (kind) {
      case "done":
        return "text-green-700";
      case "running":
        return "text-amber-700";
      case "waiting":
        return "text-blue-700";
      case "failed":
        return "text-red-700";
      case "blocked":
        return "text-amber-900";
      default:
        return "text-sam-muted";
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {isTestSurface ? (
            <>
              <span className="rounded-full bg-amber-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                {safeT("admin_deploy_env_badge", {
                  fallbackKo: "테스트 환경",
                  fallbackEn: "Test environment",
                })}
              </span>
              <span className="rounded-full border border-amber-500/50 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900">
                {safeT("admin_deploy_env_data_badge", {
                  fallbackKo: "테스트 데이터",
                  fallbackEn: "Test data",
                })}
              </span>
            </>
          ) : null}
        </div>
        <h1 className="text-lg font-semibold text-sam-fg">
          {safeT("admin_deploy_title", {
            fallbackKo: "배포 · 운영 적용",
            fallbackEn: "Deploy · Promote to production",
          })}
        </h1>
        <p className="text-sm text-sam-muted">
          {safeT("admin_deploy_subtitle", {
            fallbackKo:
              "테스트에서 확인한 뒤, 준비가 되면 실제 운영(Web)에 적용합니다. DB·앱 스토어는 별도 승인입니다.",
            fallbackEn:
              "Verify on TEST, then apply Web to production when ready. DB / store apps need separate approval.",
          })}
        </p>
      </header>

      {error ? (
        <div className="rounded-ui-rect border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      {successHint ? (
        <div className="rounded-ui-rect border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
          {successHint}
        </div>
      ) : null}

      {promoteBlocked ? (
        <div className="rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {language === "en"
            ? status?.productionExecution.promote.messageEn
            : status?.productionExecution.promote.messageKo}
          <span className="mt-1 block text-xs text-amber-800/80">
            {safeT("admin_deploy_version_hint", {
              fallbackKo: "기술 식별자(SHA)",
              fallbackEn: "Technical id (SHA)",
            })}
            : {status?.productionExecution.promote.reason}
          </span>
        </div>
      ) : null}

      {blockReason ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-sm text-sam-muted">
          {blockReason}
        </div>
      ) : null}

      <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-sam-fg">
            {safeT("admin_deploy_runtime", {
              fallbackKo: "현재 상태 한눈에",
              fallbackEn: "Status at a glance",
            })}
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={Sam.btn.secondary}
              disabled={busy}
              onClick={() => {
                setSuccessHint(null);
                void load();
              }}
            >
              {safeT("admin_deploy_refresh", {
                fallbackKo: "검증 결과 새로고침",
                fallbackEn: "Refresh results",
              })}
            </button>
            <button
              type="button"
              className={Sam.btn.secondary}
              disabled={busy}
              onClick={() => {
                setSuccessHint(null);
                void load();
              }}
            >
              {safeT("admin_deploy_check_test_deploy", {
                fallbackKo: "테스트 배포 상태 확인",
                fallbackEn: "Check TEST deploy status",
              })}
            </button>
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-sam-muted">
              {safeT("admin_deploy_version_label", {
                fallbackKo: "버전 정보",
                fallbackEn: "Version",
              })}
            </dt>
            <dd className="text-sam-fg">{shortSha(runtimeSha)}</dd>
            <dd className="mt-0.5 break-all font-mono text-[11px] text-sam-muted">
              {runtimeSha ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">
              {safeT("admin_deploy_env_label", { fallbackKo: "환경", fallbackEn: "Environment" })}
            </dt>
            <dd className="text-sam-fg">
              {isTestSurface
                ? safeT("admin_deploy_confirm_target_test", {
                    fallbackKo: "테스트 환경",
                    fallbackEn: "Test environment",
                  })
                : safeT("admin_deploy_confirm_target_prod", {
                    fallbackKo: "실제 운영",
                    fallbackEn: "Production",
                  })}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">
              {safeT("admin_deploy_db_label", {
                fallbackKo: "데이터 위치",
                fallbackEn: "Data location",
              })}
            </dt>
            <dd className="text-sam-fg">
              {status?.databaseTarget ?? "—"}
              {status?.projectRef ? (
                <span className="mt-0.5 block font-mono text-[11px] text-sam-muted">
                  {status.projectRef}
                </span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">
              {safeT("admin_deploy_execution", {
                fallbackKo: "실제 운영 적용",
                fallbackEn: "Production apply",
              })}
            </dt>
            <dd className="text-sam-fg">
              {status?.promoteEnabled
                ? safeT("admin_deploy_exec_ready", {
                    fallbackKo: "실행 가능",
                    fallbackEn: "Runnable",
                  })
                : safeT("admin_deploy_exec_blocked", {
                    fallbackKo: "실행할 수 없음",
                    fallbackEn: "Cannot run",
                  })}
            </dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="text-sm font-semibold text-sam-fg">
          {safeT("admin_deploy_status_board", {
            fallbackKo: "작업 진행 현황",
            fallbackEn: "Work progress",
          })}
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
                    {safeT("admin_deploy_col_checked_at", {
                      fallbackKo: "마지막 확인",
                      fallbackEn: "Last checked",
                    })}
                    :{" "}
                  </dt>
                  <dd className="inline text-sam-fg">{formatAt(row.checkedAt)}</dd>
                </div>
                <div>
                  <dt className="inline">
                    {safeT("admin_deploy_col_version", {
                      fallbackKo: "관련 버전",
                      fallbackEn: "Version",
                    })}
                    :{" "}
                  </dt>
                  <dd className="inline font-mono text-sam-fg">{row.version}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="inline">
                    {safeT("admin_deploy_col_done", {
                      fallbackKo: "완료된 내용",
                      fallbackEn: "Completed",
                    })}
                    :{" "}
                  </dt>
                  <dd className="inline text-sam-fg">{row.done}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="inline">
                    {safeT("admin_deploy_col_remaining", {
                      fallbackKo: "남은 내용",
                      fallbackEn: "Remaining",
                    })}
                    :{" "}
                  </dt>
                  <dd className="inline text-sam-fg">{row.remaining}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="inline">
                    {safeT("admin_deploy_col_reason", {
                      fallbackKo: "실패·차단 이유",
                      fallbackEn: "Fail / block reason",
                    })}
                    :{" "}
                  </dt>
                  <dd className="inline text-sam-fg">{row.reason}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="inline">
                    {safeT("admin_deploy_col_next", {
                      fallbackKo: "다음에 할 일",
                      fallbackEn: "Next step",
                    })}
                    :{" "}
                  </dt>
                  <dd className="inline text-sam-fg">{row.next}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="inline">
                    {safeT("admin_deploy_col_evidence", {
                      fallbackKo: "확인 기록",
                      fallbackEn: "Evidence",
                    })}
                    :{" "}
                  </dt>
                  <dd className="inline font-mono text-[11px] text-sam-fg">{row.evidence}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-sam-fg">
            {safeT("admin_deploy_matrix", {
              fallbackKo: "필수 점검 결과",
              fallbackEn: "Required check results",
            })}
          </h2>
          <button
            type="button"
            className={Sam.btn.secondary}
            disabled={busy || !runtimeSha || !isOwner}
            onClick={() => setConfirmOpen("gates")}
          >
            {busy
              ? safeT("admin_deploy_busy", { fallbackKo: "처리 중…", fallbackEn: "Working…" })
              : safeT("admin_deploy_run_gates", {
                  fallbackKo: "필수 점검 실행",
                  fallbackEn: "Run required checks",
                })}
          </button>
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
                  <span className="ml-2 font-mono text-[10px] text-sam-muted">{row.gateId}</span>
                </span>
                <span
                  className={
                    row.result === "pass"
                      ? "text-green-700"
                      : row.result === "fail"
                        ? "text-red-700"
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
          {safeT("admin_deploy_matrix_note", {
            fallbackKo:
              "* 필수. 완료는 서버 확인 기록만 인정합니다. 손으로 완료 처리하지 않습니다.",
            fallbackEn: "* Required. Done needs server evidence only. No manual Done.",
          })}
        </p>
      </section>

      <section className="flex flex-wrap gap-2">
        <button
          type="button"
          className={Sam.btn.secondary}
          disabled={busy || !runtimeSha || !isOwner || !gatesOk || verified}
          onClick={() => setConfirmOpen("verify")}
        >
          {safeT("admin_deploy_mark_verified", {
            fallbackKo: "검증 완료",
            fallbackEn: "Mark verified",
          })}
        </button>
        <button
          type="button"
          className={Sam.btn.secondary}
          disabled={busy || !runtimeSha || !isOwner || !verified}
          onClick={() => setConfirmOpen("cancel")}
        >
          {safeT("admin_deploy_cancel_verified", {
            fallbackKo: "검증 취소",
            fallbackEn: "Cancel verified",
          })}
        </button>
        <button
          type="button"
          className={Sam.btn.secondary}
          disabled={busy || !runtimeSha || !isOwner}
          onClick={() => setConfirmOpen("mock")}
        >
          {safeT("admin_deploy_mock_pipeline", {
            fallbackKo: "모의 배포 실행",
            fallbackEn: "Run mock deploy",
          })}
        </button>
      </section>

      <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="text-sm font-semibold text-sam-fg">
          {safeT("admin_deploy_pipeline", {
            fallbackKo: "배포 준비 단계",
            fallbackEn: "Deploy readiness steps",
          })}
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
                  <span className="ml-2 font-mono text-[10px] text-sam-muted">{id}</span>
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
          {safeT("admin_deploy_promote_web", {
            fallbackKo: "실제 운영에 적용 (Web)",
            fallbackEn: "Apply to production (Web)",
          })}
        </h2>
        <label className="block text-sm">
          <span className="text-sam-muted">
            {safeT("admin_deploy_confirm_sha", {
              fallbackKo: "버전 정보 재입력 (이중 확인)",
              fallbackEn: "Re-type version (double confirm)",
            })}
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
            {safeT("admin_deploy_reauth", {
              fallbackKo: "재인증: PROMOTE 입력",
              fallbackEn: "Re-auth: type PROMOTE",
            })}
          </span>
          <input
            className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 font-mono text-sm"
            value={reauthConfirm}
            onChange={(e) => setReauthConfirm(e.target.value)}
            autoComplete="off"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={Sam.btn.primary}
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
            onClick={() => setConfirmOpen("promote")}
          >
            {safeT("admin_deploy_apply_cta", {
              fallbackKo: "실제 운영에 적용",
              fallbackEn: "Apply to production",
            })}
          </button>
          <button
            type="button"
            className={Sam.btn.secondary}
            disabled={busy || rollbackBlocked || !isOwner || !runtimeSha}
            onClick={() => setConfirmOpen("rollback")}
          >
            {safeT("admin_deploy_rollback", {
              fallbackKo: "이전 정상 버전으로 복구",
              fallbackEn: "Rollback to last good",
            })}
          </button>
        </div>
        {promoteBlocked ? (
          <p className="text-xs text-sam-muted">
            {safeT("admin_deploy_promote_disabled_hint", {
              fallbackKo:
                "실제 운영 적용·복구는 서버에서도 막혀 있습니다. (Area B — 별도 승인 필요)",
              fallbackEn:
                "Production apply/rollback stay server-blocked (Area B — separate approval).",
            })}
          </p>
        ) : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-sam-fg">
          {safeT("admin_deploy_history", {
            fallbackKo: "이력 및 오류 상세",
            fallbackEn: "History & error detail",
          })}
        </h2>
        <ul className="space-y-1 text-sm">
          {historyRows.length === 0 ? (
            <li className="text-sam-muted">—</li>
          ) : (
            historyRows.map((r) => (
              <li key={r.key} className="text-xs text-sam-fg">
                <span className="text-sam-muted">{formatAt(r.at)}</span>
                {" · "}
                <span className="font-mono">{shortSha(r.sha)}</span>
                {" · "}
                {r.label}
                {r.detail ? ` · ${r.detail}` : ""}
              </li>
            ))
          )}
        </ul>
      </section>

      {confirmOpen && confirmMeta ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-lg"
          >
            <h3 className="text-sm font-semibold text-sam-fg">
              {safeT("admin_deploy_confirm_title", {
                fallbackKo: "실행 확인",
                fallbackEn: "Confirm action",
              })}
            </h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-sam-muted">
                  {safeT("admin_deploy_confirm_action", {
                    fallbackKo: "실행할 작업",
                    fallbackEn: "Action",
                  })}
                </dt>
                <dd className="text-sam-fg">
                  {safeT(confirmMeta.actionKey, {
                    fallbackKo: confirmMeta.actionKo,
                    fallbackEn: confirmMeta.actionEn,
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-sam-muted">
                  {safeT("admin_deploy_confirm_target", {
                    fallbackKo: "적용 대상",
                    fallbackEn: "Target",
                  })}
                </dt>
                <dd className="text-sam-fg">
                  {confirmMeta.target === "test"
                    ? safeT("admin_deploy_confirm_target_test", {
                        fallbackKo: "테스트 환경",
                        fallbackEn: "Test environment",
                      })
                    : safeT("admin_deploy_confirm_target_prod", {
                        fallbackKo: "실제 운영",
                        fallbackEn: "Production",
                      })}
                </dd>
              </div>
              <div>
                <dt className="text-sam-muted">
                  {safeT("admin_deploy_confirm_version", {
                    fallbackKo: "영향 버전",
                    fallbackEn: "Version affected",
                  })}
                </dt>
                <dd className="break-all font-mono text-xs text-sam-fg">{runtimeSha ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">
                  {safeT("admin_deploy_confirm_risk", {
                    fallbackKo: "결과 및 위험",
                    fallbackEn: "Outcome & risk",
                  })}
                </dt>
                <dd className="text-sam-fg">
                  {safeT(confirmMeta.bodyKey, {
                    fallbackKo: confirmMeta.bodyKo,
                    fallbackEn: confirmMeta.bodyEn,
                  })}{" "}
                  {confirmMeta.target === "test"
                    ? safeT("admin_deploy_confirm_risk_test", {
                        fallbackKo:
                          "테스트 데이터·기록만 바뀝니다. 실제 사용자 서비스는 그대로입니다.",
                        fallbackEn: "Only TEST data/records change. Live users are unaffected.",
                      })
                    : safeT("admin_deploy_confirm_risk_prod_blocked", {
                        fallbackKo:
                          "실제 운영 변경이 시도되지만 서버에서 차단됩니다. Area B 승인 전에는 적용되지 않습니다.",
                        fallbackEn:
                          "A production change is attempted but the server blocks it until Area B approval.",
                      })}
                </dd>
              </div>
            </dl>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={Sam.btn.secondary}
                disabled={busy}
                onClick={() => setConfirmOpen(null)}
              >
                {safeT("admin_deploy_dialog_cancel", { fallbackKo: "취소", fallbackEn: "Cancel" })}
              </button>
              <button
                type="button"
                className={Sam.btn.primary}
                disabled={busy}
                onClick={() => {
                  if (confirmOpen === "gates") void runRequiredGates();
                  else if (confirmOpen === "verify") void markVerified();
                  else if (confirmOpen === "cancel") void cancelVerified();
                  else if (confirmOpen === "mock") void mockPipeline(true);
                  else if (confirmOpen === "promote") void promoteWeb();
                  else void rollback();
                }}
              >
                {safeT("admin_deploy_dialog_ok", { fallbackKo: "확인", fallbackEn: "Confirm" })}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
