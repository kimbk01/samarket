"use client";

/**
 * 모임 운영 정책 (설계 moim §8 「운영 정책 설정」 · D6 값은 여기서 관리) — 숫자 항목(빈 칸 = 검사 안 함) · 금지어 목록.
 * 저장 = 사유 필수 · 낙관적 잠금(다른 관리자가 먼저 저장하면 409 → 새 값을 다시 불러온다).
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
  type MoimAdminPolicyIntKey,
} from "@/lib/admin/moim/moim-admin-contract";
import { MOIM_ADMIN_FIELD, MOIM_ADMIN_REASON, MoimAdminTime, moimAdminSend, useMoimSettleBanner } from "@/components/admin/moim/admin-moim-shared";

type PoliciesResponse = { ok?: boolean; error?: string; policies?: Record<string, unknown> & { updated_at: string; banned_words: string[] | null } };
type Draft = Record<MoimAdminPolicyIntKey, string> & { banned: string };

function toDraft(p: Record<string, unknown> & { banned_words: string[] | null }): Draft {
  const out = { banned: (p.banned_words ?? []).join("\n") } as Draft;
  for (const k of MOIM_ADMIN_POLICY_INT_KEYS) out[k] = p[k] == null ? "" : String(p[k]);
  return out;
}

function wordsOf(text: string): string[] {
  return [...new Set(text.split(/[\n,]/).map((w) => w.trim()).filter(Boolean))];
}

export function AdminMoimPoliciesPage() {
  const { t } = useI18n();
  const { state, reload } = useCommunityAdminJson<PoliciesResponse>("/api/admin/moim/policies");
  const p = state.data?.policies ?? null;
  const base = useMemo(() => (p ? toDraft(p) : null), [p]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseKey, setBaseKey] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const { settle, node } = useMoimSettleBanner(reload);
  if (p && baseKey !== p.updated_at) {
    setBaseKey(p.updated_at);
    setDraft(base);
  }

  const patch: Record<string, unknown> = {};
  if (draft && base) {
    for (const k of MOIM_ADMIN_POLICY_INT_KEYS) {
      if (draft[k].trim() !== base[k]) patch[k] = draft[k].trim() === "" ? null : Number(draft[k]);
    }
    const words = wordsOf(draft.banned);
    if (words.join("\n") !== wordsOf(base.banned).join("\n")) patch.banned_words = words;
  }
  const changed = Object.keys(patch);
  const words = draft ? wordsOf(draft.banned) : [];
  const wordsOk = words.length <= MOIM_ADMIN_BANNED_WORDS_MAX && words.every((w) => w.length <= MOIM_ADMIN_BANNED_WORD_MAX_LEN);
  const numbersOk = draft ? MOIM_ADMIN_POLICY_INT_KEYS.every((k) => draft[k].trim() === "" || /^\d+$/.test(draft[k].trim())) : false;

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
          <div className="flex flex-wrap justify-end gap-2">
            <AdminActionButton variant="secondary" disabled={!changed.length} onClick={() => setDraft(base)}>
              {t("admin_moim_cancel_edit")}
            </AdminActionButton>
            <AdminActionButton variant="primary" disabled={!changed.length || !wordsOk || !numbersOk} onClick={() => setConfirming(true)}>
              {t("admin_moim_save")}
            </AdminActionButton>
          </div>
        </div>
      ) : null}
      {confirming && p ? (
        <CommunityActionSheet
          title={t("admin_moim_policies_title")}
          rows={[{ label: t("admin_moim_field_changed"), value: changed.map((k) => (k === "banned_words" ? t("admin_moim_policy_banned_words") : t(`admin_moim_policy_${k}` as MessageKey))).join(", ") }]}
          notice={t("admin_moim_policies_notice")}
          reason={MOIM_ADMIN_REASON}
          confirmLabel={t("admin_moim_save")}
          onSubmit={(reason) => moimAdminSend("/api/admin/moim/policies", { patch, expectedUpdatedAt: p.updated_at, reason }, t, "PUT")}
          onClose={() => setConfirming(false)}
          onSettled={(k) => {
            setConfirming(false);
            settle(k);
          }}
        />
      ) : null}
    </CommunityListShell>
  );
}
