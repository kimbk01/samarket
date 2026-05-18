"use client";

import type { BusinessProfile } from "@/lib/types/business";
import { BUSINESS_STATUS_LABELS } from "@/lib/business/business-utils";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

interface BusinessProfileViewProps {
  profile: BusinessProfile;
  isOwner?: boolean;
}

export function BusinessProfileView({ profile, isOwner }: BusinessProfileViewProps) {
  const { t } = useI18n();
  const street = (profile.addressStreetLine ?? "").trim();
  const detail = (profile.addressDetail ?? "").trim();
  const fullAddress = (profile.addressLabel ?? "").trim();

  return (
    <div className="space-y-4">
      <div className="rounded-ui-rect bg-sam-surface p-4">
        <div className="flex items-start gap-3">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-sam-border-soft">
            {profile.logoUrl ? (
               
              <img src={profile.logoUrl} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="sam-text-page-title font-semibold text-sam-fg">
              {profile.shopName}
            </h1>
            {fullAddress ? (
              <p className="mt-0.5 sam-text-body-secondary text-sam-muted">{fullAddress}</p>
            ) : street || detail ? (
              <>
                {street ? (
                  <p className="mt-0.5 sam-text-body-secondary text-sam-muted">{street}</p>
                ) : null}
                {detail ? (
                  <p className="mt-0.5 sam-text-body-secondary text-sam-muted">{detail}</p>
                ) : null}
              </>
            ) : null}
            {isOwner && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="inline-block rounded bg-sam-surface-muted px-2 py-0.5 sam-text-helper text-sam-muted">
                  {BUSINESS_STATUS_LABELS[profile.status]}
                </span>
                {profile.approvalStatusRaw === "approved" && (
                  <span
                    className={`inline-block rounded px-2 py-0.5 sam-text-helper ${
                      profile.isVisible ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"
                    }`}
                  >
                    {profile.isVisible ? "공개 노출" : "비공개"}
                  </span>
                )}
              </div>
            )}
            {isOwner && (profile.storeCategoryName || profile.storeTopicName) && (
              <p className="mt-1.5 sam-text-helper text-sam-muted">
                노출 분류:{" "}
                {[profile.storeCategoryName, profile.storeTopicName].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        </div>
        {profile.description && (
          <p className="mt-3 sam-text-body text-sam-fg whitespace-pre-wrap">
            {profile.description}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-4 sam-text-body-secondary text-sam-muted">
          <span>{t("business_phase7_149", { v1: profile.productCount })}</span>
          <span>{t("business_phase7_312", { v1: profile.followerCount })}</span>
          {profile.reviewCount > 0 && (
            <span>
              후기 {profile.reviewCount} · ★ {profile.averageRating.toFixed(1)}
            </span>
          )}
        </div>
        {(profile.phone || profile.kakaoId) && (
          <div className="mt-3 border-t border-sam-border-soft pt-3 sam-text-body-secondary text-sam-muted">
            {profile.phone && <p>{t("business_phase7_196", { v1: profile.phone })}</p>}
            {profile.kakaoId && (
              <p>{t("business_phase7_298", { v1: profile.kakaoId })}</p>
            )}
          </div>
        )}
      </div>
      {/* 상점 후기 요약 placeholder */}
      {profile.reviewCount > 0 && (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="sam-text-body font-medium text-sam-fg">{t("business_phase7_333")}</h2>
          <p className="mt-1 sam-text-body-secondary text-sam-muted">
            후기 {profile.reviewCount}개 · 평균 ★ {profile.averageRating.toFixed(1)}
            (상세 후기 목록 연결 예정)
          </p>
        </div>
      )}
    </div>
  );
}
