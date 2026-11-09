"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useOwnerAdminUrlSearchParams } from "@/lib/business/use-owner-admin-url-search-params";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { OwnerCta } from "@/lib/business/owner-cta-classes";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { ConsentLegalDocSheet } from "@/components/legal/ConsentLegalDocSheet";
import { StorePartnerPledgeFields } from "@/components/stores/partner/StorePartnerPledgeFields";
import { formatManilaDateTime } from "@/lib/stores/commission/store-commission-ledger-query";
import {
  resolveStoreTaxonomyPrimaryDisplayName,
  resolveStoreTaxonomyTopicDisplayName,
} from "@/lib/stores/resolve-store-taxonomy-display-name";
import {
  formatPartnerFeePercent,
  type StorePartnerTermsDocument,
} from "@/lib/stores/partner/store-partner-agreement-contract";
import {
  fetchOwnerPartnerAgreement,
  type OwnerPartnerAgreementResponse,
} from "@/lib/stores/partner/fetch-owner-partner-agreement";

/**
 * 사장님 「입점 계약」 (`/stores/owner/partner-agreement?storeId=`) — 설계 v2 §4-5.
 * 동의한 계약 목록(버전·동의 시각·무료 종료일·무료 후 요율·원문 보기) + 현재 게시 버전 미동의면 「새 계약 동의 필요」.
 * 동의하지 않아도 다른 기능은 막지 않는다 (Owner 결정 기본값: 안내만).
 */
export function OwnerStorePartnerAgreementView() {
  const { t, language } = useI18n();
  const locale = language === "en" ? "en" : "ko";
  const searchParams = useOwnerAdminUrlSearchParams();
  const storeId = searchParams.get("storeId")?.trim() ?? "";
  const [data, setData] = useState<OwnerPartnerAgreementResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [agree, setAgree] = useState({ agreeTerms: false, agreeFee: false });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [viewDoc, setViewDoc] = useState<StorePartnerTermsDocument | null>(null);

  useEffect(() => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    void fetchOwnerPartnerAgreement(storeId, locale).then((json) => {
      if (cancelled) return;
      setData(json);
      setFailed(json == null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [storeId, locale, reloadKey]);

  const categoryLabel = useMemo(() => {
    const tax = data?.taxonomy;
    if (!tax) return "";
    const topic = tax.topic
      ? resolveStoreTaxonomyTopicDisplayName(language, tax.topic.slug, tax.topic.name, tax.topic.nameEn)
      : "";
    const cat = tax.category
      ? resolveStoreTaxonomyPrimaryDisplayName(language, tax.category.slug, tax.category.name, tax.category.nameEn)
      : "";
    return data?.current?.feeScope === "topic" ? topic || cat : cat || topic;
  }, [data, language]);

  const current = data?.current ?? null;
  const terms = current?.terms ?? null;

  const submit = useCallback(async () => {
    if (!terms || !storeId || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/partner-agreement`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: terms.id,
          version: terms.version,
          locale: terms.locale,
          agreeTerms: agree.agreeTerms,
          agreeFee: agree.agreeFee,
        }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        setSaveError(
          json?.error === "partner_terms_version_mismatch"
            ? t("partner_err_version_mismatch")
            : json?.error === "partner_agreement_required"
              ? t("partner_err_required")
              : t("owner_partner_save_failed")
        );
        if (json?.error === "partner_terms_version_mismatch") setReloadKey((n) => n + 1);
        return;
      }
      setSheetOpen(false);
      setAgree({ agreeTerms: false, agreeFee: false });
      setSaved(true);
      setReloadKey((n) => n + 1);
    } catch {
      setSaveError(t("owner_partner_save_failed"));
    } finally {
      setSaving(false);
    }
  }, [agree, saving, storeId, t, terms]);

  if (loading) {
    return <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>;
  }
  if (failed || !data) {
    return (
      <div className={OWNER_STORE_STACK_Y_CLASS}>
        <p className="sam-text-body text-sam-danger" role="alert">
          {t("partner_load_failed")}
        </p>
        <button type="button" className={OwnerCta.secondary} onClick={() => setReloadKey((n) => n + 1)}>
          {t("partner_retry_btn")}
        </button>
      </div>
    );
  }

  const agreements = data.agreements ?? [];
  const documents = data.documents ?? {};

  return (
    <div className={OWNER_STORE_STACK_Y_CLASS} data-owner-partner-agreement="1">
      {saved ? (
        <p className="rounded-ui-rect bg-sam-success-soft px-3 py-2 sam-text-body text-sam-success" role="status">
          {t("owner_partner_agreed_toast")}
        </p>
      ) : null}

      {data.needsReconsent && terms ? (
        <div
          className="rounded-ui-rect border border-sam-warning/30 bg-sam-warning-soft p-4"
          data-owner-partner-reconsent="1"
        >
          <h2 className="sam-text-body-lg font-semibold text-sam-fg">{t("owner_partner_reconsent_card_title")}</h2>
          <p className="mt-1 sam-text-body text-sam-fg">
            {t("owner_partner_reconsent_card_body", { version: terms.version })}
          </p>
          <p className="mt-1 sam-text-helper text-sam-muted">{t("owner_partner_reconsent_note")}</p>
          <button
            type="button"
            className={`mt-3 ${OwnerCta.primary}`}
            onClick={() => {
              setSaveError(null);
              setSheetOpen(true);
            }}
          >
            {t("owner_partner_reconsent_btn")}
          </button>
        </div>
      ) : null}

      {!terms ? (
        <p className="sam-text-body text-sam-muted">{t("owner_partner_terms_not_published")}</p>
      ) : null}

      <OwnerStoreAdminDashSection title={t("owner_partner_list_title")}>
        {agreements.length === 0 ? (
          <p className="sam-text-body text-sam-muted">{t("owner_partner_empty")}</p>
        ) : (
          <ul className="divide-y divide-sam-border-soft">
            {agreements.map((a) => {
              const doc = documents[a.documentId] ?? null;
              const pct = formatPartnerFeePercent(a.feePercentAfter);
              return (
                <li key={a.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="sam-text-body font-semibold text-sam-fg">
                      {t("owner_partner_row_version", { version: a.version })}
                    </span>
                    <span className="rounded-full bg-sam-surface-muted px-2 py-0.5 sam-text-xxs text-sam-muted">
                      {a.source === "reconsent"
                        ? t("owner_partner_source_reconsent")
                        : t("owner_partner_source_application")}
                    </span>
                  </div>
                  <p className="sam-text-body-secondary text-sam-muted">
                    {t("owner_partner_row_agreed_at", { datetime: formatManilaDateTime(a.agreedAt) })}
                  </p>
                  <p className="sam-text-body-secondary text-sam-fg">
                    {a.freeUntil
                      ? t("owner_partner_row_free_until", { date: a.freeUntil })
                      : t("owner_partner_row_no_free")}
                    {" · "}
                    {pct ? t("owner_partner_row_fee_after", { percent: pct }) : t("owner_partner_row_fee_unknown")}
                  </p>
                  {doc ? (
                    <button
                      type="button"
                      className="inline-flex min-h-[44px] items-center sam-text-body font-medium text-sam-primary underline"
                      onClick={() => setViewDoc(doc)}
                    >
                      {t("owner_partner_view_original_btn")}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </OwnerStoreAdminDashSection>

      {current && terms ? (
        <DibayBottomSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title={terms.title}
          heightRatio={0.85}
          footer={
            <button
              type="button"
              className={`w-full ${OwnerCta.primary}`}
              disabled={saving || !agree.agreeTerms || !agree.agreeFee}
              onClick={() => void submit()}
            >
              {saving ? t("common_processing") : t("owner_partner_agree_btn")}
            </button>
          }
        >
          <div className="space-y-3 px-1 pb-2">
            <StorePartnerPledgeFields
              offer={current}
              categoryLabel={categoryLabel}
              agreeTerms={agree.agreeTerms}
              agreeFee={agree.agreeFee}
              onChange={setAgree}
              disabled={saving}
            />
            {saveError ? (
              <p className="sam-text-body text-sam-danger" role="alert">
                {saveError}
              </p>
            ) : null}
          </div>
        </DibayBottomSheet>
      ) : null}

      <ConsentLegalDocSheet
        open={viewDoc != null}
        kind="store_partner_terms"
        document={viewDoc ? { title: viewDoc.title, body: viewDoc.body, version: viewDoc.version } : null}
        onClose={() => setViewDoc(null)}
      />
    </div>
  );
}
