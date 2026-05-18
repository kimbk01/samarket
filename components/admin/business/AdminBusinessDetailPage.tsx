"use client";

import { useCallback, useState } from "react";
import type { BusinessProfile } from "@/lib/types/business";
import {
  getBusinessProfileById,
  setBusinessProfileAdminMemo,
} from "@/lib/business/mock-business-profiles";
import { getBusinessProfileLogs } from "@/lib/business/mock-business-logs";
import type { BusinessProfileStatus } from "@/lib/types/business";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminBusinessActionPanel } from "./AdminBusinessActionPanel";
import { AdminBusinessLogList } from "./AdminBusinessLogList";

const STATUS_LABEL_KEYS: Record<BusinessProfileStatus, MessageKey> = {
  pending: "admin_biz_status_pending",
  active: "admin_biz_status_active",
  paused: "admin_biz_status_paused",
  rejected: "admin_biz_status_rejected",
};

interface AdminBusinessDetailPageProps {
  profileId: string;
}

export function AdminBusinessDetailPage({ profileId }: AdminBusinessDetailPageProps) {
  const { t } = useI18n();
  const [refresh, setRefresh] = useState(0);
  const [memoInput, setMemoInput] = useState("");
  const profile = getBusinessProfileById(profileId);
  const logs = getBusinessProfileLogs(profileId);
  const refreshDetail = useCallback(() => setRefresh((r) => r + 1), []);

  if (!profile) {
    return (
      <div className="py-8 text-center sam-text-body text-sam-muted">
        {t("admin_biz_not_found")}
      </div>
    );
  }

  const handleSaveMemo = () => {
    setBusinessProfileAdminMemo(profileId, memoInput);
    setMemoInput("");
    refreshDetail();
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_biz_page_detail" backHref="/admin/business" />
      <AdminBusinessActionPanel profile={profile} onActionSuccess={refreshDetail} />
      <AdminCard titleKey="admin_biz_card_info">
        <dl className="grid gap-2 sam-text-body">
          <div>
            <dt className="text-sam-muted">ID</dt>
            <dd className="font-medium text-sam-fg">{profile.id}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_biz_label_name")}</dt>
            <dd>{profile.shopName}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">slug</dt>
            <dd className="text-sam-fg">{profile.slug}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_biz_label_owner")}</dt>
            <dd>
              {profile.ownerNickname} ({profile.ownerUserId})
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_biz_label_status")}</dt>
            <dd>
              <span
                className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${
                  profile.status === "pending"
                    ? "bg-amber-100 text-amber-800"
                    : profile.status === "active"
                      ? "bg-emerald-50 text-emerald-800"
                      : profile.status === "paused"
                        ? "bg-sam-border-soft text-sam-fg"
                        : "bg-red-50 text-red-700"
                }`}
              >
                {t(STATUS_LABEL_KEYS[profile.status])}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_biz_label_intro")}</dt>
            <dd className="whitespace-pre-wrap text-sam-fg">
              {profile.description || "-"}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_biz_label_contact")}</dt>
            <dd className="text-sam-fg">
              {profile.phone || "-"} / {profile.kakaoId || "-"}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_biz_label_region")}</dt>
            <dd className="space-y-1 text-sam-fg">
              <div>
                {[profile.region, profile.city].filter((x) => String(x ?? "").trim()).join(" · ") ||
                  "—"}
              </div>
              {(profile.addressStreetLine ?? "").trim() ||
              (profile.addressDetail ?? "").trim() ? (
                <>
                  {(profile.addressStreetLine ?? "").trim() ? (
                    <div className="sam-text-body-secondary">{(profile.addressStreetLine ?? "").trim()}</div>
                  ) : null}
                  {(profile.addressDetail ?? "").trim() ? (
                    <div className="sam-text-body-secondary text-sam-muted">
                      {(profile.addressDetail ?? "").trim()}
                    </div>
                  ) : null}
                </>
              ) : (profile.addressLabel ?? "").trim() ? (
                <div className="sam-text-body-secondary">{(profile.addressLabel ?? "").trim()}</div>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_biz_label_stats")}</dt>
            <dd>
              {profile.productCount} / {profile.reviewCount} / ★
              {profile.averageRating.toFixed(1)}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_biz_label_dates")}</dt>
            <dd className="sam-text-body-secondary text-sam-muted">
              {new Date(profile.createdAt).toLocaleString("ko-KR")}
              {profile.approvedAt &&
                ` / ${new Date(profile.approvedAt).toLocaleString("ko-KR")}`}
            </dd>
          </div>
        </dl>
      </AdminCard>
      <AdminCard titleKey="admin_biz_card_memo">
        <div className="flex gap-2">
          <input
            type="text"
            value={memoInput}
            onChange={(e) => setMemoInput(e.target.value)}
            placeholder={t("admin_biz_memo_ph")}
            className="flex-1 rounded border border-sam-border px-3 py-2 sam-text-body"
          />
          <button
            type="button"
            onClick={handleSaveMemo}
            className="rounded border border-sam-border bg-sam-app px-3 py-2 sam-text-body text-sam-fg hover:bg-sam-surface-muted"
          >
            {t("common_save")}
          </button>
        </div>
        {profile.adminMemo && (
          <p className="mt-2 sam-text-body-secondary text-sam-muted">{profile.adminMemo}</p>
        )}
      </AdminCard>
      <AdminCard titleKey="admin_biz_card_history">
        <AdminBusinessLogList logs={logs} />
      </AdminCard>
    </div>
  );
}
