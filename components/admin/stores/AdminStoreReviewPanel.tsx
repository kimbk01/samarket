"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { splitStoreDescriptionAndKakao } from "@/lib/stores/split-store-description-kakao";
import { formatPhMobileDisplay, parsePhMobileInput } from "@/lib/utils/ph-mobile";
import {
  ADMIN_STORE_APPROVAL_LABEL_KEYS,
  type AdminStoreReviewRow,
  buildAdminStoreDateRows,
  type TaxonomyRelation,
} from "@/components/admin/stores/admin-store-review-model";
import {
  ReviewAddressValue,
  ReviewBlock,
  ReviewRow,
  sbBtnDanger,
  sbBtnDangerSoft,
  sbBtnPrimary,
  sbBtnSecondary,
  sbBtnWarn,
} from "@/components/admin/stores/admin-store-review-ui";
import { StoreOpsOnOffSwitch } from "@/components/business/admin/StoreOpsOnOffSwitch";
import {
  resolveStoreTaxonomyPrimaryDisplayName,
  resolveStoreTaxonomyTopicDisplayName,
} from "@/lib/stores/resolve-store-taxonomy-display-name";

function embedRelation(v: TaxonomyRelation | TaxonomyRelation[] | null | undefined): TaxonomyRelation | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v[0] ?? null;
  return v;
}

function embedRelationName(v: TaxonomyRelation | TaxonomyRelation[] | null | undefined): string {
  const rel = embedRelation(v);
  return String(rel?.name ?? "").trim();
}

function dash(v: string | null | undefined): string {
  const t = (v ?? "").trim();
  return t || "—";
}

export type AdminStoreReviewPanelProps = {
  store: AdminStoreReviewRow | null;
  onClose?: () => void;
  onRunAction?: (
    action: string,
    payload?: { reason?: string; enabled?: boolean; store_name?: string }
  ) => void | boolean | Promise<void | boolean>;
  actionBusy?: boolean;
  onSetOwnerIdentityEditable?: (enabled: boolean) => void;
  identityActionBusy?: boolean;
};

export function AdminStoreReviewPanel({
  store,
  onClose,
  onRunAction,
  actionBusy,
  onSetOwnerIdentityEditable,
  identityActionBusy,
}: AdminStoreReviewPanelProps) {
  const { t, language } = useI18n();
  const [adminStoreName, setAdminStoreName] = useState(store?.store_name ?? "");
  const [actionNote, setActionNote] = useState("");
  const [visibleBusy, setVisibleBusy] = useState(false);

  useEffect(() => {
    setAdminStoreName(store?.store_name ?? "");
    setActionNote("");
  }, [store?.id, store?.store_name]);

  if (!store) return null;

  const statusKey = ADMIN_STORE_APPROVAL_LABEL_KEYS[store.approval_status];
  const statusLabel = statusKey ? t(statusKey) : store.approval_status;
  const { intro: storeIntro } = splitStoreDescriptionAndKakao(store.description, store.kakao_id);
  const dateRows = buildAdminStoreDateRows(store);

  const gcashNoDigits = parsePhMobileInput(store.email ?? "");
  const gcashNoDisplay =
    gcashNoDigits.length === 11 ? formatPhMobileDisplay(gcashNoDigits) : dash(store.email);

  const catRel = embedRelation(store.store_categories);
  const topicRel = embedRelation(store.store_topics);
  const catDb = catRel?.slug
    ? resolveStoreTaxonomyPrimaryDisplayName(language, catRel.slug, String(catRel.name ?? ""), catRel.name_en)
    : embedRelationName(store.store_categories);
  const topicDb = topicRel?.slug
    ? resolveStoreTaxonomyTopicDisplayName(language, topicRel.slug, String(topicRel.name ?? ""), topicRel.name_en)
    : embedRelationName(store.store_topics);

  const profileUrl = store.profile_image_url?.trim();
  const busy = Boolean(actionBusy || identityActionBusy || visibleBusy);
  const reason = actionNote.trim();

  const runActionWithOptionalNote = (action: string) => {
    void onRunAction?.(action, reason ? { reason } : undefined);
  };

  const visibilityValue =
    store.approval_status === "approved" && onRunAction ? (
      <div className="flex items-center gap-2">
        <StoreOpsOnOffSwitch
          checked={store.is_visible}
          disabled={busy}
          onCheckedChange={async (next) => {
            setVisibleBusy(true);
            try {
              const result = await Promise.resolve(onRunAction("set_store_visible", { enabled: next }));
              return result !== false;
            } finally {
              setVisibleBusy(false);
            }
          }}
          ariaLabel={
            store.is_visible ? t("admin_stores_visible_toggle_aria_off") : t("admin_stores_visible_toggle_aria_on")
          }
        />
        <span className="text-[13px] text-[#6B6B6B]">
          {store.is_visible ? t("admin_stores_visible_y") : t("admin_stores_visible_n")}
        </span>
      </div>
    ) : store.is_visible ? (
      t("admin_stores_visible_y")
    ) : (
      t("admin_stores_visible_n")
    );

  return (
    <div>
      <ReviewBlock title="상태">
        <ReviewRow label="심사상태" value={statusLabel} />
        <ReviewRow label="노출상태" value={visibilityValue} />
        {dateRows.map((row) => (
          <ReviewRow key={row.label} label={row.label} value={row.value} />
        ))}
      </ReviewBlock>

      {onRunAction ? (
        <ReviewBlock title="운영">
          <div className="py-2">
            <ReviewRow
              label="매장명"
              value={
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={adminStoreName}
                    onChange={(e) => setAdminStoreName(e.target.value)}
                    className="min-w-[12rem] flex-1 rounded-sm border border-[#D4C5B9] bg-white px-2.5 py-1.5 text-[#1E3932] outline-none focus:border-[#00704A]"
                    placeholder={t("admin_stores_field_store_name_ph")}
                    disabled={busy}
                  />
                  <button
                    type="button"
                    disabled={busy || adminStoreName.trim().length < 2}
                    onClick={() => onRunAction("set_store_name", { store_name: adminStoreName.trim() })}
                    className={sbBtnPrimary}
                  >
                    {t("admin_stores_save_store_name")}
                  </button>
                </div>
              }
            />
            {onSetOwnerIdentityEditable ? (
              <ReviewRow
                label="매장명 수정"
                value={
                  <button
                    type="button"
                    disabled={identityActionBusy}
                    onClick={() => onSetOwnerIdentityEditable(!store.owner_can_edit_store_identity)}
                    className={`rounded-sm border px-2.5 py-0.5 text-[13px] font-medium disabled:opacity-50 ${
                      store.owner_can_edit_store_identity
                        ? "border-[#A5D6A7] bg-[#E8F5E9] text-[#1B5E20]"
                        : "border-[#D4C5B9] bg-[#F2F0EB] text-[#6B6B6B]"
                    }`}
                  >
                    {identityActionBusy
                      ? t("common_processing")
                      : store.owner_can_edit_store_identity
                        ? "허용 ON"
                        : "허용 OFF"}
                  </button>
                }
              />
            ) : null}
          </div>

          <div className="border-t border-[#E8E2D8]/80 py-3">
            <ReviewRow
              label={t("admin_stores_action_note_label")}
              value={
                <textarea
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  rows={2}
                  className="w-full rounded-sm border border-[#D4C5B9] bg-white px-2.5 py-1.5 text-[#1E3932] outline-none focus:border-[#00704A]"
                  placeholder={t("admin_stores_action_note_placeholder")}
                  disabled={busy}
                />
              }
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {store.approval_status === "suspended" ? (
                <button type="button" disabled={busy} className={sbBtnPrimary} onClick={() => runActionWithOptionalNote("resume_store")}>
                  {t("admin_stores_action_resume_store")}
                </button>
              ) : store.approval_status !== "approved" ? (
                <>
                  <button type="button" disabled={busy} className={sbBtnSecondary} onClick={() => runActionWithOptionalNote("start_review")}>
                    {t("admin_stores_action_start_review")}
                  </button>
                  <button type="button" disabled={busy} className={sbBtnPrimary} onClick={() => runActionWithOptionalNote("approve_store")}>
                    {t("admin_stores_action_approve_store")}
                  </button>
                  <button type="button" disabled={busy} className={sbBtnWarn} onClick={() => runActionWithOptionalNote("request_revision")}>
                    {t("admin_stores_action_request_revision")}
                  </button>
                  <button type="button" disabled={busy} className={sbBtnDanger} onClick={() => runActionWithOptionalNote("reject_store")}>
                    {t("admin_stores_action_reject_store")}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" disabled={busy} className={sbBtnPrimary} onClick={() => runActionWithOptionalNote("approve_sales")}>
                    {t("admin_stores_action_approve_sales")}
                  </button>
                  <button type="button" disabled={busy} className={sbBtnSecondary} onClick={() => runActionWithOptionalNote("reject_sales")}>
                    {t("admin_stores_action_reject_sales")}
                  </button>
                  <button type="button" disabled={busy} className={sbBtnDangerSoft} onClick={() => runActionWithOptionalNote("suspend_store")}>
                    {t("admin_stores_action_suspend_store")}
                  </button>
                  <button type="button" disabled={busy} className={sbBtnWarn} onClick={() => runActionWithOptionalNote("suspend_sales")}>
                    {t("admin_stores_action_suspend_sales")}
                  </button>
                </>
              )}
            </div>
          </div>
        </ReviewBlock>
      ) : null}

      <ReviewBlock title="신청 정보">
        <ReviewRow label={t("admin_stores_field_email_gcash")} value={gcashNoDisplay} />
        <ReviewRow label="GCash name" value={dash(store.website_url)} />
        <ReviewRow label={t("admin_stores_field_category_primary")} value={catDb || "—"} />
        <ReviewRow label={t("admin_stores_field_category_secondary")} value={topicDb || "—"} />
        <ReviewRow label="매장 주소" value={<ReviewAddressValue store={store} />} />
        {storeIntro?.trim() ? (
          <ReviewRow
            label={t("admin_stores_section_intro")}
            value={<span className="whitespace-pre-wrap">{storeIntro.trim()}</span>}
          />
        ) : null}
        {store.application_request_note?.trim() ? (
          <ReviewRow
            label={t("admin_stores_section_request_note")}
            value={<span className="whitespace-pre-wrap">{store.application_request_note.trim()}</span>}
          />
        ) : null}
        {store.revision_note?.trim() ? (
          <ReviewRow
            label={t("admin_stores_section_revision")}
            value={<span className="whitespace-pre-wrap text-[#F57F17]">{store.revision_note.trim()}</span>}
          />
        ) : null}
        {store.rejected_reason?.trim() ? (
          <ReviewRow
            label={t("admin_stores_section_reject_reason")}
            value={<span className="whitespace-pre-wrap text-[#B71C1C]">{store.rejected_reason.trim()}</span>}
          />
        ) : null}
        {store.suspended_reason?.trim() ? (
          <ReviewRow
            label={t("admin_stores_section_suspend_reason")}
            value={<span className="whitespace-pre-wrap">{store.suspended_reason.trim()}</span>}
          />
        ) : null}
        {profileUrl ? (
          <ReviewRow
            label={t("admin_stores_image_profile")}
            value={
              <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="block max-w-xs overflow-hidden rounded-sm border border-[#D4C5B9]">
                <img src={profileUrl} alt="" className="max-h-40 w-full object-cover" />
              </a>
            }
          />
        ) : null}
      </ReviewBlock>

      {onClose ? (
        <div className="flex justify-end border-t border-[#D4C5B9] px-4 py-2">
          <button type="button" onClick={onClose} className={sbBtnSecondary}>
            {t("common_close")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
