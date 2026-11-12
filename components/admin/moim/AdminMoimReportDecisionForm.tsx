"use client";

/**
 * 모임 신고 처리 폼 (설계 moim §6 P13·P14 · §8 「모임 신고 처리」 · M6) — 신고 상세 서랍 안.
 * 검토 시작(접수 → 검토 중) · 조치/기각 · 콘텐츠 숨김(대상별 문구) · 모임 제재(추천 제외·경고·차단 + 끝나는 날) ·
 * 이용 제한(대상 작성자/모임장 · 글/댓글/전체 · 기간/영구) · 같은 대상 신고 함께 처리 · 사유(필수).
 * 처리 결과(상태·조치·처리자·시각)는 닫힌 신고에 보여 준다. 경고 누적은 표시만 하고 자동 차단하지 않는다(P14).
 */
import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import {
  MOIM_ADMIN_NO_CONTENT_HIDE_TARGETS,
  MOIM_ADMIN_REASON_MIN_LENGTH,
  MOIM_ADMIN_RESTRICT_DAY_OPTIONS,
  MOIM_ADMIN_RESTRICTIONS,
  MOIM_ADMIN_SANCTION_LEVELS,
  type MoimAdminPerson,
  type MoimAdminReportDecision,
  type MoimAdminReportTargetType,
  type MoimAdminRestriction,
  type MoimAdminRestrictWho,
  type MoimAdminSanctionLevel,
} from "@/lib/admin/moim/moim-admin-contract";
import { MOIM_ADMIN_FIELD, MoimAdminNote, MoimAdminPersonCell, MoimAdminTime, moimAdminSend } from "@/components/admin/moim/admin-moim-shared";

export type MoimReportResultAction = {
  id: string;
  target_kind: string;
  level: string;
  reason: string;
  ends_at: string | null;
  revoked_at: string | null;
  created_at: string;
  actor: MoimAdminPerson | null;
  targetPerson: MoimAdminPerson | null;
};

export type MoimReportDecisionContext = {
  reportId: string;
  status: string;
  targetType: string;
  handledAt: string | null;
  handler: MoimAdminPerson | null;
  host: MoimAdminPerson | null;
  warnCount: number | null;
  openSameTargetCount: number | null;
  resultActions: MoimReportResultAction[];
};

const CONTENT_HIDE_LABEL: Partial<Record<MoimAdminReportTargetType, MessageKey>> = {
  post: "admin_moim_decide_hide_content",
  comment: "admin_moim_decide_hide_content",
  album: "admin_moim_decide_hide_content",
  schedule: "admin_moim_decide_cancel_schedule",
  chat_message: "admin_moim_decide_hide_message",
};

export type MoimReportDecisionBanner = { ok: boolean; message: string } | null;
type Banner = MoimReportDecisionBanner;

/** 안내(banner)는 서랍이 들고 있다 — 처리 후 상세를 다시 불러와도 결과 안내가 남는다 */
export function MoimReportDecisionPanel({
  ctx,
  onChanged,
  banner,
  setBanner,
}: {
  ctx: MoimReportDecisionContext;
  onChanged: () => void;
  banner: Banner;
  setBanner: (b: Banner) => void;
}) {
  const { t } = useI18n();
  const open = ctx.status === "received" || ctx.status === "reviewing";
  return (
    <section className="space-y-2" data-moim-report-decision>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-sam-fg">{t("admin_moim_decide_title")}</h3>
        {ctx.warnCount != null ? (
          <AdminToneBadge tone={ctx.warnCount > 0 ? "warning" : "neutral"}>{t("admin_moim_warn_count", { n: ctx.warnCount })}</AdminToneBadge>
        ) : null}
      </div>
      {ctx.warnCount != null && ctx.warnCount > 0 ? <MoimAdminNote>{t("admin_moim_decide_warn_note")}</MoimAdminNote> : null}
      {banner ? (
        <p
          role={banner.ok ? "status" : "alert"}
          className={`rounded-ui-rect border px-3 py-2 text-[13px] text-sam-fg ${banner.ok ? "border-sam-success bg-sam-success-soft" : "border-sam-danger bg-sam-danger-soft"}`}
        >
          {banner.message}
        </p>
      ) : null}
      {open ? <DecisionForm ctx={ctx} onChanged={onChanged} setBanner={setBanner} /> : <DecisionResult ctx={ctx} />}
    </section>
  );
}

function DecisionResult({ ctx }: { ctx: MoimReportDecisionContext }) {
  const { t } = useI18n();
  return (
    <div className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-app p-3 text-[13px]">
      <dl className="grid gap-2 sm:grid-cols-3">
        <div>
          <dt className="text-sam-muted">{t("admin_moim_col_status")}</dt>
          <dd>{t(`admin_moim_report_status_${ctx.status}` as MessageKey)}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_moim_decide_handler")}</dt>
          <dd>
            <MoimAdminPersonCell person={ctx.handler} />
          </dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_moim_decide_handled_at")}</dt>
          <dd>
            <MoimAdminTime iso={ctx.handledAt} />
          </dd>
        </div>
      </dl>
      {ctx.resultActions.length ? (
        <ul className="space-y-1">
          {ctx.resultActions.map((a) => (
            <li key={a.id} className="rounded-ui-rect border border-sam-border-soft bg-sam-surface px-2 py-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-sam-fg">{t(`admin_moim_level_${a.level}` as MessageKey)}</span>
                {a.revoked_at ? <AdminToneBadge tone="neutral">{t("admin_moim_sanction_state_revoked")}</AdminToneBadge> : null}
                {a.ends_at ? (
                  <span className="text-[12px] text-sam-muted">
                    {t("admin_moim_decide_until")} <MoimAdminTime iso={a.ends_at} />
                  </span>
                ) : null}
              </div>
              {a.targetPerson ? <MoimAdminPersonCell person={a.targetPerson} /> : null}
              <div className="text-[12px] text-sam-muted">
                <MoimAdminTime iso={a.created_at} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sam-muted">{t("admin_moim_decide_no_actions")}</p>
      )}
    </div>
  );
}

function DecisionForm({
  ctx,
  onChanged,
  setBanner,
}: {
  ctx: MoimReportDecisionContext;
  onChanged: () => void;
  setBanner: (b: Banner) => void;
}) {
  const { t } = useI18n();
  const targetType = ctx.targetType as MoimAdminReportTargetType;
  const canHide = !MOIM_ADMIN_NO_CONTENT_HIDE_TARGETS.includes(targetType) && Boolean(CONTENT_HIDE_LABEL[targetType]);
  const [decision, setDecision] = useState<MoimAdminReportDecision>("actioned");
  const [contentHide, setContentHide] = useState(false);
  const [level, setLevel] = useState<MoimAdminSanctionLevel | "">("");
  const [endDate, setEndDate] = useState("");
  const [who, setWho] = useState<MoimAdminRestrictWho | "">("");
  const [restriction, setRestriction] = useState<MoimAdminRestriction>("all");
  const [days, setDays] = useState<string>("7");
  const [closeSame, setCloseSame] = useState(false);
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const actioned = decision === "actioned";
  const anyAction = (canHide && contentHide) || level !== "" || who !== "";
  const reasonOk = reason.trim().length >= MOIM_ADMIN_REASON_MIN_LENGTH;
  const ready = reasonOk && (actioned ? anyAction : true) && !busy;

  const runReview = async () => {
    setBusy(true);
    setBanner(null);
    const r = await moimAdminSend(`/api/admin/moim/reports/${encodeURIComponent(ctx.reportId)}/review`, {}, t);
    setBusy(false);
    if (!r.ok) setBanner({ ok: false, message: r.status === 409 ? t("admin_moim_stale") : r.code });
    onChanged();
  };

  const submit = async () => {
    setBusy(true);
    setBanner(null);
    const body = {
      expectedStatus: ctx.status,
      decision,
      reason: reason.trim(),
      contentHide: actioned && canHide && contentHide,
      moimLevel: actioned && level ? level : null,
      moimEndsAt: actioned && level && endDate ? `${endDate}T23:59:59+08:00` : null,
      userRestrict: actioned && who ? { who, restriction, days: days ? Number(days) : null } : null,
      closeSameTarget: closeSame,
    };
    const r = await moimAdminSend(`/api/admin/moim/reports/${encodeURIComponent(ctx.reportId)}/decision`, body, t);
    setBusy(false);
    setConfirming(false);
    if (r.ok) {
      setBanner({ ok: true, message: t("admin_moim_decide_done") });
      onChanged();
      return;
    }
    if (r.status === 409 || r.status === 404) {
      setBanner({ ok: false, message: t(r.status === 409 ? "admin_moim_stale" : "admin_moim_gone") });
      onChanged();
      return;
    }
    setBanner({ ok: false, message: r.code });
  };

  const summary: string[] = [t(actioned ? "admin_moim_decide_actioned" : "admin_moim_decide_dismissed")];
  if (actioned) {
    if (canHide && contentHide && CONTENT_HIDE_LABEL[targetType]) summary.push(t(CONTENT_HIDE_LABEL[targetType] as MessageKey));
    if (level) summary.push(t(`admin_moim_level_${level}` as MessageKey));
    if (who) {
      summary.push(
        `${t("admin_moim_level_user_restrict")} · ${t(`admin_moim_decide_who_${who}` as MessageKey)} · ${t(`admin_moim_decide_restriction_${restriction}` as MessageKey)} · ${
          days ? t("admin_moim_decide_days_n", { n: Number(days) }) : t("admin_moim_decide_days_forever")
        }`
      );
    }
  }
  if (closeSame) summary.push(t("admin_moim_decide_close_same", { n: ctx.openSameTargetCount ?? 0 }));

  return (
    <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-app p-3 text-[13px]">

      {ctx.status === "received" ? (
        <div className="flex flex-wrap items-center gap-2">
          <AdminActionButton size="sm" variant="secondary" disabled={busy} onClick={() => void runReview()}>
            {t("admin_moim_decide_start_review")}
          </AdminActionButton>
          <span className="text-[12px] text-sam-muted">{t("admin_moim_decide_start_review_hint")}</span>
        </div>
      ) : null}

      <fieldset className="flex flex-wrap gap-4" disabled={confirming}>
        <legend className="mb-1 text-sam-muted">{t("admin_moim_decide_result")}</legend>
        {(["actioned", "dismissed"] as const).map((d) => (
          <label key={d} className="flex items-center gap-1.5">
            <input type="radio" name="moim-report-decision" checked={decision === d} onChange={() => setDecision(d)} />
            <span>{t(`admin_moim_decide_${d}` as MessageKey)}</span>
          </label>
        ))}
      </fieldset>

      {actioned ? (
        <fieldset className="space-y-3" disabled={confirming}>
          {canHide ? (
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={contentHide} onChange={(e) => setContentHide(e.target.checked)} />
              <span>{t(CONTENT_HIDE_LABEL[targetType] as MessageKey)}</span>
            </label>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sam-muted">{t("admin_moim_decide_moim_level")}</span>
              <select className={MOIM_ADMIN_FIELD} value={level} onChange={(e) => setLevel(e.target.value as MoimAdminSanctionLevel | "")}>
                <option value="">{t("admin_moim_decide_none")}</option>
                {MOIM_ADMIN_SANCTION_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {t(`admin_moim_level_${l}` as MessageKey)}
                  </option>
                ))}
              </select>
            </label>
            {level ? (
              <label className="flex flex-col gap-1">
                <span className="text-sam-muted">{t("admin_moim_field_ends_at")}</span>
                <input type="date" className={MOIM_ADMIN_FIELD} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                <span className="text-[12px] text-sam-muted">{t("admin_moim_field_ends_at_hint")}</span>
              </label>
            ) : null}
          </div>
          {level ? <p className="text-[12px] text-sam-muted">{t(`admin_moim_level_${level}_effect` as MessageKey)}</p> : null}

          <div className="grid gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-sam-muted">{t("admin_moim_level_user_restrict")}</span>
              <select className={MOIM_ADMIN_FIELD} value={who} onChange={(e) => setWho(e.target.value as MoimAdminRestrictWho | "")}>
                <option value="">{t("admin_moim_decide_none")}</option>
                <option value="target">{t("admin_moim_decide_who_target")}</option>
                <option value="host">{t("admin_moim_decide_who_host")}</option>
              </select>
            </label>
            {who ? (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-sam-muted">{t("admin_moim_decide_restriction")}</span>
                  <select className={MOIM_ADMIN_FIELD} value={restriction} onChange={(e) => setRestriction(e.target.value as MoimAdminRestriction)}>
                    {MOIM_ADMIN_RESTRICTIONS.map((r) => (
                      <option key={r} value={r}>
                        {t(`admin_moim_decide_restriction_${r}` as MessageKey)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sam-muted">{t("admin_moim_decide_days")}</span>
                  <select className={MOIM_ADMIN_FIELD} value={days} onChange={(e) => setDays(e.target.value)}>
                    {MOIM_ADMIN_RESTRICT_DAY_OPTIONS.map((n) => (
                      <option key={n} value={String(n)}>
                        {t("admin_moim_decide_days_n", { n })}
                      </option>
                    ))}
                    <option value="">{t("admin_moim_decide_days_forever")}</option>
                  </select>
                </label>
              </>
            ) : null}
          </div>
          {who === "host" && ctx.host ? (
            <div className="text-[12px] text-sam-muted">
              {t("admin_moim_decide_who_host")}: <MoimAdminPersonCell person={ctx.host} />
            </div>
          ) : null}
          {who ? <p className="text-[12px] text-sam-muted">{t("admin_moim_decide_restrict_note")}</p> : null}
        </fieldset>
      ) : (
        <p className="text-[12px] text-sam-muted">{t("admin_moim_decide_dismiss_note")}</p>
      )}

      {ctx.openSameTargetCount ? (
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={closeSame} disabled={confirming} onChange={(e) => setCloseSame(e.target.checked)} />
          <span>{t("admin_moim_decide_close_same", { n: ctx.openSameTargetCount })}</span>
        </label>
      ) : null}

      <label className="flex flex-col gap-1">
        <span className="text-sam-muted">{t("admin_moim_decide_reason")}</span>
        <textarea
          className={`${MOIM_ADMIN_FIELD} min-h-[80px]`}
          maxLength={500}
          value={reason}
          disabled={confirming}
          onChange={(e) => setReason(e.target.value)}
        />
        <span className="text-[12px] text-sam-muted">{t("admin_moim_decide_reporter_notice")}</span>
      </label>

      {confirming ? (
        <div className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-2">
          <p className="font-medium text-sam-fg">{t("admin_moim_decide_confirm_title")}</p>
          <ul className="list-inside list-disc text-sam-fg">
            {summary.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <AdminActionButton size="sm" variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>
              {t("admin_moim_decide_back")}
            </AdminActionButton>
            <AdminActionButton size="sm" variant={actioned ? "danger" : "primary"} disabled={busy} onClick={() => void submit()}>
              {t("admin_moim_decide_submit")}
            </AdminActionButton>
          </div>
        </div>
      ) : (
        <AdminActionButton size="sm" variant="primary" disabled={!ready} onClick={() => setConfirming(true)}>
          {t("admin_moim_decide_next")}
        </AdminActionButton>
      )}
    </div>
  );
}
