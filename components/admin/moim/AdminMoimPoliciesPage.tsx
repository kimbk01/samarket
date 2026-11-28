"use client";

/**
 * 모임 운영 정책 (설계 moim §8 「운영 정책 설정」 · D6 값은 여기서 관리) — 숫자 항목(빈 칸 = 검사 안 함) · 금지어 목록 ·
 * 가입 질문 금지어 · 금지 모임 유형 · 신고 사유 (R4 §3 — 코드 상수에서 운영 정책으로).
 * 저장 = 사유 필수 · 낙관적 잠금(다른 관리자가 먼저 저장하면 409 → 새 값을 다시 불러온다).
 * 신고 사유는 저장된 코드를 지울 수 없고 끄기만 한다(지난 신고의 사유 이름 보호 · SQL 도 거부).
 * 새 열이 없는 옛 DB(값이 배열이 아님)에서는 그 칸을 보이지 않는다.
 */
import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { CommunityActionSheet, CommunityListShell } from "@/components/admin/community/kit/CommunityAdminKit";
import { useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import {
  MOIM_ADMIN_BANNED_WORD_MAX_LEN,
  MOIM_ADMIN_BANNED_WORDS_MAX,
  MOIM_ADMIN_POLICY_INT_KEYS,
  MOIM_ADMIN_POLICY_LABEL_MAX_LEN,
  MOIM_ADMIN_PROHIBITED_TYPES_MAX,
  MOIM_ADMIN_REPORT_REASONS_MAX,
  parseMoimAdminPolicyRows,
  type MoimAdminPoliciesRow,
  type MoimAdminPolicyIntKey,
} from "@/lib/admin/moim/moim-admin-contract";
import {
  MOIM_ADMIN_FIELD,
  MOIM_ADMIN_REASON,
  MoimAdminTime,
  invalidateMoimAdminReportReasons,
  moimAdminSend,
  useMoimSettleBanner,
} from "@/components/admin/moim/admin-moim-shared";

type PoliciesResponse = { ok?: boolean; error?: string; policies?: MoimAdminPoliciesRow };

/** 목록 줄 — saved = 불러온 값에 있던 줄(코드 고정 · 신고 사유는 지울 수 없음) */
export type MoimPolicyDraftRow = { code: string; ko: string; en: string; active: boolean; saved: boolean };

export type MoimPoliciesDraft = Record<MoimAdminPolicyIntKey, string> & {
  banned: string;
  /** null = 옛 DB(열 없음) → 칸을 숨기고 저장에 넣지 않는다 */
  question: string | null;
  types: MoimPolicyDraftRow[] | null;
  reasons: MoimPolicyDraftRow[] | null;
};

function rowsOf(raw: unknown): MoimPolicyDraftRow[] | null {
  if (!Array.isArray(raw)) return null;
  return raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({
      code: typeof x.code === "string" ? x.code : "",
      ko: typeof x.label_ko === "string" ? x.label_ko : "",
      en: typeof x.label_en === "string" ? x.label_en : "",
      active: x.is_active !== false,
      saved: true,
    }));
}

export function moimPoliciesDraft(p: MoimAdminPoliciesRow): MoimPoliciesDraft {
  const out = {
    banned: (p.banned_words ?? []).join("\n"),
    question: Array.isArray(p.question_banned_words) ? p.question_banned_words.join("\n") : null,
    types: rowsOf(p.prohibited_types),
    reasons: rowsOf(p.report_reasons),
  } as MoimPoliciesDraft;
  for (const k of MOIM_ADMIN_POLICY_INT_KEYS) out[k] = p[k] == null ? "" : String(p[k]);
  return out;
}

function wordsOf(text: string): string[] {
  return [...new Set(text.split(/[\n,]/).map((w) => w.trim()).filter(Boolean))];
}

function wordsValid(words: string[]): boolean {
  return words.length <= MOIM_ADMIN_BANNED_WORDS_MAX && words.every((w) => w.length <= MOIM_ADMIN_BANNED_WORD_MAX_LEN);
}

/** 화면 줄 → 저장 모양 (SQL jsonb) */
export function moimPolicyRowsPayload(rows: readonly MoimPolicyDraftRow[], withActive: boolean) {
  return rows.map((r) =>
    withActive
      ? { code: r.code.trim(), label_ko: r.ko.trim(), label_en: r.en.trim(), is_active: r.active }
      : { code: r.code.trim(), label_ko: r.ko.trim(), label_en: r.en.trim() }
  );
}

/**
 * 정책 화면의 바뀐 값만 담은 저장 요청 (순수 함수 · 시험 대상).
 * 목록은 줄 순서까지 같은지로 비교한다. 옛 DB(열 없음 = null)의 항목은 넣지 않는다.
 */
export function moimPoliciesPatch(draft: MoimPoliciesDraft, base: MoimPoliciesDraft): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const k of MOIM_ADMIN_POLICY_INT_KEYS) {
    if (draft[k].trim() !== base[k]) patch[k] = draft[k].trim() === "" ? null : Number(draft[k]);
  }
  const words = wordsOf(draft.banned);
  if (words.join("\n") !== wordsOf(base.banned).join("\n")) patch.banned_words = words;
  if (draft.question !== null && base.question !== null) {
    const q = wordsOf(draft.question);
    if (q.join("\n") !== wordsOf(base.question).join("\n")) patch.question_banned_words = q;
  }
  if (draft.types && base.types) {
    const next = moimPolicyRowsPayload(draft.types, false);
    if (JSON.stringify(next) !== JSON.stringify(moimPolicyRowsPayload(base.types, false))) patch.prohibited_types = next;
  }
  if (draft.reasons && base.reasons) {
    const next = moimPolicyRowsPayload(draft.reasons, true);
    if (JSON.stringify(next) !== JSON.stringify(moimPolicyRowsPayload(base.reasons, true))) patch.report_reasons = next;
  }
  return patch;
}

const PATCH_LABEL: Record<string, MessageKey> = {
  banned_words: "admin_moim_policy_banned_words",
  question_banned_words: "admin_moim_policy_question_banned_words",
  prohibited_types: "admin_moim_policy_prohibited_types",
  report_reasons: "admin_moim_policy_report_reasons",
};

/** 금지 유형·신고 사유 줄 편집 — 신고 사유(withActive)는 사용 켜기/끄기, 저장된 줄은 지울 수 없다 */
export function MoimPolicyRowsEditor({
  title,
  desc,
  rows,
  max,
  withActive,
  onChange,
}: {
  title: string;
  desc: string;
  rows: MoimPolicyDraftRow[];
  max: number;
  withActive: boolean;
  onChange: (rows: MoimPolicyDraftRow[]) => void;
}) {
  const { t } = useI18n();
  const valid = parseMoimAdminPolicyRows(moimPolicyRowsPayload(rows, withActive), withActive ? "report_reasons" : "prohibited_types") !== null;
  const set = (i: number, patch: Partial<MoimPolicyDraftRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <fieldset className="space-y-2">
      <legend className="text-sam-muted">{title}</legend>
      <p className="text-[12px] text-sam-muted">{desc}</p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} data-policy-row={r.code} className="grid gap-2 rounded-ui-rect border border-sam-border p-2 sm:grid-cols-[1fr_1.4fr_1.4fr_auto]">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] text-sam-muted">{t("admin_moim_policy_item_code")}</span>
              <input
                className={MOIM_ADMIN_FIELD}
                value={r.code}
                readOnly={r.saved}
                maxLength={40}
                placeholder={t("admin_moim_policy_item_code_hint")}
                onChange={(e) => set(i, { code: e.target.value.toLowerCase().replace(/[^a-z_]/g, "") })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] text-sam-muted">{t("admin_moim_policy_item_label_ko")}</span>
              <input className={MOIM_ADMIN_FIELD} value={r.ko} maxLength={MOIM_ADMIN_POLICY_LABEL_MAX_LEN} onChange={(e) => set(i, { ko: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] text-sam-muted">{t("admin_moim_policy_item_label_en")}</span>
              <input className={MOIM_ADMIN_FIELD} value={r.en} maxLength={MOIM_ADMIN_POLICY_LABEL_MAX_LEN} onChange={(e) => set(i, { en: e.target.value })} />
            </label>
            <div className="flex items-end gap-2">
              {withActive ? (
                <label className="flex min-h-[32px] items-center gap-1.5">
                  <input type="checkbox" checked={r.active} onChange={(e) => set(i, { active: e.target.checked })} />
                  <span>{t("admin_moim_policy_item_active")}</span>
                </label>
              ) : null}
              {withActive && r.saved ? (
                <span className="flex min-h-[32px] items-center text-[12px] text-sam-muted">{t("admin_moim_policy_item_saved")}</span>
              ) : (
                <AdminActionButton size="sm" variant="secondary" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                  {t("admin_moim_policy_item_remove")}
                </AdminActionButton>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <AdminActionButton
          size="sm"
          variant="secondary"
          disabled={rows.length >= max}
          onClick={() => onChange([...rows, { code: "", ko: "", en: "", active: true, saved: false }])}
        >
          {t("admin_moim_policy_item_add")}
        </AdminActionButton>
        {!valid ? <span className="text-[12px] text-sam-danger">{t("admin_moim_policy_items_invalid", { len: MOIM_ADMIN_POLICY_LABEL_MAX_LEN })}</span> : null}
      </div>
    </fieldset>
  );
}

export function AdminMoimPoliciesPage() {
  const { t } = useI18n();
  const { state, reload } = useCommunityAdminJson<PoliciesResponse>("/api/admin/moim/policies");
  const p = state.data?.policies ?? null;
  const base = useMemo(() => (p ? moimPoliciesDraft(p) : null), [p]);
  const [draft, setDraft] = useState<MoimPoliciesDraft | null>(null);
  const [baseKey, setBaseKey] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const { settle, node } = useMoimSettleBanner(reload);
  if (p && baseKey !== p.updated_at) {
    setBaseKey(p.updated_at);
    setDraft(base);
  }

  const patch = draft && base ? moimPoliciesPatch(draft, base) : {};
  const changed = Object.keys(patch);
  const words = draft ? wordsOf(draft.banned) : [];
  const wordsOk = wordsValid(words);
  const qWords = draft?.question != null ? wordsOf(draft.question) : [];
  const qWordsOk = wordsValid(qWords);
  const typesOk = !draft?.types || parseMoimAdminPolicyRows(moimPolicyRowsPayload(draft.types, false), "prohibited_types") !== null;
  const reasonsOk = !draft?.reasons || parseMoimAdminPolicyRows(moimPolicyRowsPayload(draft.reasons, true), "report_reasons") !== null;
  const numbersOk = draft ? MOIM_ADMIN_POLICY_INT_KEYS.every((k) => draft[k].trim() === "" || /^\d+$/.test(draft[k].trim())) : false;
  const allOk = wordsOk && qWordsOk && typesOk && reasonsOk && numbersOk;

  return (
    <CommunityListShell title={t("admin_moim_policies_title")} description={t("admin_moim_policies_desc")} banner={node}>
      {state.status === "loading" && !p ? <AdminLoadingState ko /> : null}
      {state.status === "error" ? <AdminErrorState ko code={state.code} httpStatus={state.httpStatus} onRetry={reload} /> : null}
      {draft && p ? (
        <div className="space-y-4 p-3 text-[13px]">
          <p className="text-[12px] text-sam-muted">
            {t("admin_moim_policies_updated")} <MoimAdminTime iso={p.updated_at} />
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {MOIM_ADMIN_POLICY_INT_KEYS.map((k) => (
              <label key={k} className="flex flex-col gap-1">
                <span className="text-sam-muted">{t(`admin_moim_policy_${k}` as MessageKey)}</span>
                <input
                  className={MOIM_ADMIN_FIELD}
                  inputMode="numeric"
                  value={draft[k]}
                  placeholder={t("admin_moim_policy_empty")}
                  onChange={(e) => setDraft({ ...draft, [k]: e.target.value.replace(/\D/g, "") })}
                />
              </label>
            ))}
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-sam-muted">{t("admin_moim_policy_banned_words")}</span>
            <textarea className={`${MOIM_ADMIN_FIELD} min-h-[160px]`} value={draft.banned} onChange={(e) => setDraft({ ...draft, banned: e.target.value })} />
            <span className={`text-[12px] ${wordsOk ? "text-sam-muted" : "text-sam-danger"}`}>
              {t("admin_moim_policy_banned_words_hint", { n: words.length, max: MOIM_ADMIN_BANNED_WORDS_MAX, len: MOIM_ADMIN_BANNED_WORD_MAX_LEN })}
            </span>
          </label>
          {draft.question !== null ? (
            <label className="flex flex-col gap-1">
              <span className="text-sam-muted">{t("admin_moim_policy_question_banned_words")}</span>
              <span className="text-[12px] text-sam-muted">{t("admin_moim_policy_question_banned_words_desc")}</span>
              <textarea
                className={`${MOIM_ADMIN_FIELD} min-h-[160px]`}
                value={draft.question}
                onChange={(e) => setDraft({ ...draft, question: e.target.value })}
              />
              <span className={`text-[12px] ${qWordsOk ? "text-sam-muted" : "text-sam-danger"}`}>
                {t("admin_moim_policy_banned_words_hint", { n: qWords.length, max: MOIM_ADMIN_BANNED_WORDS_MAX, len: MOIM_ADMIN_BANNED_WORD_MAX_LEN })}
              </span>
            </label>
          ) : null}
          {draft.types ? (
            <MoimPolicyRowsEditor
              title={t("admin_moim_policy_prohibited_types")}
              desc={t("admin_moim_policy_prohibited_types_desc", { n: draft.types.length, max: MOIM_ADMIN_PROHIBITED_TYPES_MAX })}
              rows={draft.types}
              max={MOIM_ADMIN_PROHIBITED_TYPES_MAX}
              withActive={false}
              onChange={(types) => setDraft({ ...draft, types })}
            />
          ) : null}
          {draft.reasons ? (
            <MoimPolicyRowsEditor
              title={t("admin_moim_policy_report_reasons")}
              desc={t("admin_moim_policy_report_reasons_desc", { n: draft.reasons.length, max: MOIM_ADMIN_REPORT_REASONS_MAX })}
              rows={draft.reasons}
              max={MOIM_ADMIN_REPORT_REASONS_MAX}
              withActive
              onChange={(reasons) => setDraft({ ...draft, reasons })}
            />
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <AdminActionButton variant="secondary" disabled={!changed.length} onClick={() => setDraft(base)}>
              {t("admin_moim_cancel_edit")}
            </AdminActionButton>
            <AdminActionButton variant="primary" disabled={!changed.length || !allOk} onClick={() => setConfirming(true)}>
              {t("admin_moim_save")}
            </AdminActionButton>
          </div>
        </div>
      ) : null}
      {confirming && p ? (
        <CommunityActionSheet
          title={t("admin_moim_policies_title")}
          rows={[
            {
              label: t("admin_moim_field_changed"),
              value: changed.map((k) => t(PATCH_LABEL[k] ?? (`admin_moim_policy_${k}` as MessageKey))).join(", "),
            },
          ]}
          notice={t("admin_moim_policies_notice")}
          reason={MOIM_ADMIN_REASON}
          confirmLabel={t("admin_moim_save")}
          onSubmit={(reason) => moimAdminSend("/api/admin/moim/policies", { patch, expectedUpdatedAt: p.updated_at, reason }, t, "PUT")}
          onClose={() => setConfirming(false)}
          onSettled={(k) => {
            setConfirming(false);
            /** 다른 어드민 화면의 신고 사유 이름도 새 값으로 */
            invalidateMoimAdminReportReasons();
            settle(k);
          }}
        />
      ) : null}
    </CommunityListShell>
  );
}
