"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { catalogDateLocale } from "@/lib/i18n/catalog-date-locale";
import { splitStoreDescriptionAndKakao } from "@/lib/stores/split-store-description-kakao";
import { formatPhMobileDisplay, parsePhMobileInput } from "@/lib/utils/ph-mobile";
import { STORE_LOCATION_SECTION_HINT_APPLY } from "@/lib/stores/store-address-form-ui";
import {
  ADMIN_STORE_APPROVAL_LABEL_KEYS,
  type AdminStoreReviewRow,
  formatAdminStoreAddressOneLine,
} from "@/components/admin/stores/admin-store-review-model";
import {
  parseFiniteLatitude,
  parseFiniteLongitude,
} from "@/lib/geo/parse-finite-geographic-coord";

function embedRelationName(
  v: { name?: string } | { name?: string }[] | null | undefined
): string {
  if (v == null) return "";
  if (Array.isArray(v)) return (v[0]?.name ?? "").trim();
  return (v.name ?? "").trim();
}

function dash(v: string | null | undefined): string {
  const t = (v ?? "").trim();
  return t || "—";
}

function normalizeAddress1ForStore(streetRaw: string, city: string, region: string): string {
  let s = streetRaw.trim();
  if (!s) return s;
  const c = city.trim();
  const r = region.trim();
  // Remove trailing ", City" / ", Region" / " City" / " Region" patterns.
  // This keeps "주소1" focused on the street/number line.
  const removeTail = (token: string) => {
    if (!token) return;
    const re = new RegExp(String.raw`(?:,\s*|\s+)${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\s*$`, "i");
    while (re.test(s)) s = s.replace(re, "").trim();
  };
  removeTail(c);
  removeTail(r);
  return s.replace(/^[,\s]+|[,\s]+$/g, "").trim();
}

function normalizeDetailForStore(street: string, detail: string, city: string, region: string): string {
  const s = street.trim();
  let d = detail.trim();
  if (!d) return d;

  // If detail accidentally contains street/full line, remove it.
  if (s) {
    const idx = d.toLowerCase().indexOf(s.toLowerCase());
    if (idx >= 0) {
      d = `${d.slice(0, idx)} ${d.slice(idx + s.length)}`.replace(/\s+/g, " ").trim();
    }
  }

  // Remove any embedded city/region tokens from detail.
  const tokens = [city, region]
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x, i, a) => a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);
  for (const t of tokens) {
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    d = d.replace(new RegExp(String.raw`(?:,\s*|\s+)${esc}(?=,|\s|$)`, "ig"), " ");
    d = d.replace(new RegExp(String.raw`^${esc}(?=,|\s|$)`, "ig"), " ");
  }

  d = d.replace(/\s+/g, " ").replace(/^[,\s]+|[,\s]+$/g, "").trim();
  return d;
}

function ReviewSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-ui-rect border border-sam-border-soft bg-sam-app/60 p-3">
      <h3 className="sam-text-body-secondary font-bold text-sam-fg">{title}</h3>
      {hint ? <p className="mt-1 sam-text-xxs leading-relaxed text-sam-muted">{hint}</p> : null}
      <div className="mt-2 space-y-2.5">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="sam-text-xxs font-medium text-sam-muted">{label}</p>
      <div className="mt-0.5 sam-text-body-secondary text-sam-fg">{value}</div>
    </div>
  );
}

export type AdminStoreReviewPanelProps = {
  store: AdminStoreReviewRow | null;
  onClose?: () => void;
  onRunAction?: (action: string, payload?: { reason?: string; enabled?: boolean; store_name?: string }) => void;
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
  const locale = catalogDateLocale(language);

  if (!store) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-6">
        <p className="sam-text-body text-sam-muted">{t("admin_stores_review_select_store")}</p>
      </div>
    );
  }

  const [adminStoreName, setAdminStoreName] = useState(store.store_name ?? "");
  useEffect(() => {
    setAdminStoreName(store.store_name ?? "");
  }, [store.id, store.store_name]);

  const statusKey = ADMIN_STORE_APPROVAL_LABEL_KEYS[store.approval_status];
  const statusLabel = statusKey ? t(statusKey) : store.approval_status;
  const { intro: storeIntro, kakao: storeKakao } = splitStoreDescriptionAndKakao(
    store.description,
    store.kakao_id
  );
  // address display is centralized in formatAdminStoreAddressOneLine

  const gcashNoDigits = parsePhMobileInput(store.email ?? "");
  const gcashNoDisplay =
    gcashNoDigits.length === 11 ? formatPhMobileDisplay(gcashNoDigits) : dash(store.email);

  const catDb = embedRelationName(store.store_categories);
  const topicDb = embedRelationName(store.store_topics);

  const imgs = [{ label: t("admin_stores_image_profile"), url: store.profile_image_url }].filter(
    (x) => x.url?.trim()
  );

  const busy = Boolean(actionBusy || identityActionBusy);

  const actionBtnBase =
    "inline-flex min-h-[2.5rem] items-center justify-center rounded-ui-rect px-3 py-2 sam-text-helper font-semibold transition disabled:pointer-events-none disabled:opacity-45";
  const actionPrimary = `${actionBtnBase} bg-signature text-white hover:bg-signature/90 active:bg-signature/95`;
  const actionSecondary = `${actionBtnBase} border border-sam-border bg-sam-surface text-sam-fg hover:bg-sam-app active:bg-sam-surface-muted`;
  const actionWarn = `${actionBtnBase} border border-amber-200 bg-amber-50 text-amber-950 hover:bg-amber-100/80 active:bg-amber-100`;
  const actionDanger = `${actionBtnBase} border border-red-300 bg-red-600 text-white hover:bg-red-700 active:bg-red-800`;
  const actionDangerSoft = `${actionBtnBase} border border-red-200 bg-sam-surface text-red-800 hover:bg-red-50 active:bg-red-100/80`;
  const actionSales = `${actionBtnBase} border border-sam-primary-border bg-sam-primary text-white hover:bg-sam-primary-hover active:bg-sam-primary-active disabled:bg-sam-primary-disabled`;
  const actionSalesOutline = `${actionBtnBase} border border-sam-primary-border bg-sam-primary-soft text-sam-primary hover:bg-sam-primary-soft-2`;

  const promptReason = (titleKey: Parameters<typeof t>[0]) => window.prompt(t(titleKey), "")?.trim() ?? "";

  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-sam-border-soft px-4 py-3">
        <div className="min-w-0">
          <p className="sam-text-helper font-semibold text-sam-muted">{t("admin_stores_review_manage")}</p>
          <h2 className="truncate sam-text-body-lg font-semibold text-sam-fg">
            {dash(store.store_name)}
          </h2>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-ui-rect px-3 py-1.5 sam-text-body-secondary font-medium text-sam-muted hover:bg-sam-surface-muted"
          >
            {t("common_close")}
          </button>
        ) : null}
      </div>

      <div className="space-y-4 p-4">
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-sam-ink px-2.5 py-0.5 sam-text-xxs font-bold text-white">
              {statusLabel}
            </span>
            {store.is_visible ? (
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 sam-text-xxs font-bold text-emerald-800">
                {t("admin_stores_visible_y")}
              </span>
            ) : (
              <span className="rounded-full bg-sam-app px-2.5 py-0.5 sam-text-xxs font-bold text-sam-muted">
                {t("admin_stores_visible_n")}
              </span>
            )}
          </div>
          <p className="mt-2 font-mono sam-text-xxs text-sam-muted">/stores/{store.slug}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href={`/stores/${encodeURIComponent(store.slug)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-helper font-semibold text-sam-fg hover:bg-sam-app"
            >
              {t("admin_stores_public_page")}
            </a>
          </div>
          <p className="mt-2 sam-text-helper text-sam-muted">
            {t("admin_stores_applied_at", {
              date: new Date(store.created_at).toLocaleString(locale),
            })}
            {store.approved_at ? (
              <>
                {" "}
                ·{" "}
                {t("admin_stores_approved_at", {
                  date: new Date(store.approved_at).toLocaleString(locale),
                })}
              </>
            ) : null}
          </p>

          {onRunAction ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {store.approval_status === "suspended" ? (
                <button
                  type="button"
                  disabled={busy}
                  className={actionPrimary}
                  onClick={() => onRunAction("resume_store")}
                >
                  {t("admin_stores_action_resume_store")}
                </button>
              ) : store.approval_status !== "approved" ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    className={actionPrimary}
                    onClick={() => onRunAction("approve_store")}
                  >
                    {t("admin_stores_action_approve_store")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={actionWarn}
                    onClick={() => {
                      const note = promptReason("admin_stores_prompt_revision_memo");
                      if (!note) return;
                      onRunAction("request_revision", { reason: note });
                    }}
                  >
                    {t("admin_stores_action_request_revision")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={actionDanger}
                    onClick={() => {
                      const reason = promptReason("admin_stores_prompt_reject_reason");
                      if (!reason) return;
                      onRunAction("reject_store", { reason });
                    }}
                  >
                    {t("admin_stores_action_reject_store")}
                  </button>
                    {onClose ? (
                      <button
                        type="button"
                        disabled={busy}
                        className={actionSecondary}
                        onClick={() => onClose?.()}
                      >
                        {t("common_close")}
                      </button>
                    ) : null}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    className={actionSales}
                    onClick={() => onRunAction("approve_sales")}
                  >
                    {t("admin_stores_action_approve_sales")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={actionSalesOutline}
                    onClick={() => {
                      const reason = promptReason("admin_stores_prompt_sales_reject_reason");
                      if (!reason) return;
                      onRunAction("reject_sales", { reason });
                    }}
                  >
                    {t("admin_stores_action_reject_sales")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={actionDangerSoft}
                    onClick={() => {
                      const reason = promptReason("admin_stores_prompt_suspend_store_reason");
                      if (!reason) return;
                      onRunAction("suspend_store", { reason });
                    }}
                  >
                    {t("admin_stores_action_suspend_store")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={actionWarn}
                    onClick={() => {
                      const reason = promptReason("admin_stores_prompt_suspend_sales_reason");
                      if (!reason) return;
                      onRunAction("suspend_sales", { reason });
                    }}
                  >
                    {t("admin_stores_action_suspend_sales")}
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>

        <ReviewSection title={t("admin_stores_section_admin_only")}>
          <div className="grid grid-cols-1 gap-2">
            <Field
              label={t("admin_stores_field_store_name_admin")}
              value={
                <div className="flex flex-col gap-2">
                  <input
                    value={adminStoreName}
                    onChange={(e) => setAdminStoreName(e.target.value)}
                    className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body-secondary font-medium text-sam-fg"
                    placeholder={t("admin_stores_field_store_name_ph")}
                    disabled={busy || !onRunAction}
                  />
                  <button
                    type="button"
                    disabled={busy || !onRunAction || adminStoreName.trim().length < 2}
                    onClick={() => onRunAction?.("set_store_name", { store_name: adminStoreName.trim() })}
                    className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body-secondary font-semibold text-white disabled:opacity-50"
                  >
                    {t("admin_stores_save_store_name")}
                  </button>
                </div>
              }
            />
            <Field
              label={t("admin_stores_field_owner_slug")}
              value={<span className="font-mono sam-text-xxs text-sam-muted">/stores/{store.slug}</span>}
            />
          </div>
        </ReviewSection>

        <ReviewSection title={t("admin_stores_section_applicant")}>
          <Field
            label={t("admin_stores_field_nickname")}
            value={<span className="font-medium">{dash(store.applicant_nickname)}</span>}
          />
          <Field
            label={t("admin_stores_field_owner_user_id")}
            value={<span className="break-all font-mono sam-text-xxs">{store.owner_user_id}</span>}
          />
        </ReviewSection>

        <ReviewSection title={t("admin_stores_section_contact")}>
          <Field label={t("admin_stores_field_phone")} value={<span className="font-medium">{dash(store.phone)}</span>} />
          <Field label={t("admin_stores_field_kakao")} value={<span className="font-medium">{dash(storeKakao)}</span>} />
          <Field label={t("admin_stores_field_email_gcash")} value={<span className="font-medium">{gcashNoDisplay}</span>} />
          <Field label="GCash name" value={<span className="font-medium">{dash(store.website_url)}</span>} />
        </ReviewSection>

        <ReviewSection title={t("admin_stores_section_address")} hint={STORE_LOCATION_SECTION_HINT_APPLY}>
          <Field
            label={t("admin_stores_field_region")}
            value={(() => {
              const reg = (store.region ?? "").trim();
              const city = (store.city ?? "").trim();
              if (!reg && !city) return "—";
              return [reg, city].filter(Boolean).join(" · ");
            })()}
          />
          <Field
            label={t("admin_stores_field_address1")}
            value={(() => {
              const city = (store.city ?? "").trim();
              const region = (store.region ?? "").trim();
              const street = normalizeAddress1ForStore(String(store.address_line1 ?? ""), city, region);
              return dash(street);
            })()}
          />
          <Field
            label={t("admin_stores_field_address_detail")}
            value={(() => {
              const city = (store.city ?? "").trim();
              const region = (store.region ?? "").trim();
              const street = normalizeAddress1ForStore(String(store.address_line1 ?? ""), city, region);
              const detail = normalizeDetailForStore(street, String(store.address_line2 ?? ""), city, region);
              return dash(detail);
            })()}
          />
          <Field
            label={t("admin_stores_field_full_address")}
            value={
              <span className="font-medium text-sam-fg">
                {formatAdminStoreAddressOneLine(store)}
              </span>
            }
          />
          <Field
            label={t("admin_stores_field_map_coords")}
            value={(() => {
              const la = parseFiniteLatitude(store.lat);
              const ln = parseFiniteLongitude(store.lng);
              if (la != null && ln != null) {
                return (
                  <span className="font-mono sam-text-xxs text-sam-fg">
                    {la}, {ln}
                  </span>
                );
              }
              return (
                <span className="font-medium text-amber-800 dark:text-amber-200">
                  {t("admin_stores_coords_missing")}
                </span>
              );
            })()}
          />
        </ReviewSection>

        <ReviewSection title={t("admin_stores_section_business")}>
          <Field label={t("admin_stores_field_category_primary")} value={<span className="font-medium">{catDb || "—"}</span>} />
          <Field label={t("admin_stores_field_category_secondary")} value={<span className="font-medium">{topicDb || "—"}</span>} />
          <Field label="business_type" value={dash(store.business_type)} />
          <Field
            label={t("admin_stores_field_identity_edit_allowed")}
            value={
              store.owner_can_edit_store_identity
                ? t("admin_stores_identity_edit_yes")
                : t("admin_stores_identity_edit_no")
            }
          />
        </ReviewSection>

        {storeIntro?.trim() ? (
          <ReviewSection title={t("admin_stores_section_intro")}>
            <pre className="whitespace-pre-wrap break-words font-sans sam-text-body-secondary leading-relaxed text-sam-fg">
              {storeIntro.trim()}
            </pre>
          </ReviewSection>
        ) : null}

        {store.revision_note?.trim() ? (
          <ReviewSection title={t("admin_stores_section_revision")}>
            <p className="whitespace-pre-wrap sam-text-body-secondary text-amber-950">{store.revision_note.trim()}</p>
          </ReviewSection>
        ) : null}
        {store.rejected_reason?.trim() ? (
          <ReviewSection title={t("admin_stores_section_reject_reason")}>
            <p className="whitespace-pre-wrap sam-text-body-secondary text-red-900">{store.rejected_reason.trim()}</p>
          </ReviewSection>
        ) : null}
        {store.suspended_reason?.trim() ? (
          <ReviewSection title={t("admin_stores_section_suspend_reason")}>
            <p className="whitespace-pre-wrap sam-text-body-secondary text-sam-fg">{store.suspended_reason.trim()}</p>
          </ReviewSection>
        ) : null}

        {imgs.length > 0 ? (
          <ReviewSection title={t("admin_stores_section_images")}>
            {imgs.map(({ label, url }) => (
              <div key={label}>
                <p className="mb-1 sam-text-xxs text-sam-muted">{label}</p>
                <a
                  href={url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block overflow-hidden rounded-ui-rect border border-sam-border"
                >
                  <img src={url!} alt="" className="max-h-48 w-full object-cover" />
                </a>
              </div>
            ))}
          </ReviewSection>
        ) : null}

        {onSetOwnerIdentityEditable ? (
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
            <p className="sam-text-body-secondary font-medium text-sam-fg">{t("admin_stores_owner_identity_edit")}</p>
            <button
              type="button"
              disabled={identityActionBusy}
              onClick={() => onSetOwnerIdentityEditable(!store.owner_can_edit_store_identity)}
              className="mt-2 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2.5 sam-text-body-secondary font-semibold text-sam-fg hover:bg-sam-app disabled:opacity-50"
            >
              {identityActionBusy
                ? t("common_processing")
                : store.owner_can_edit_store_identity
                  ? t("admin_stores_identity_revoke")
                  : t("admin_stores_identity_grant")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

