"use client";

import { useCallback, useEffect, useState } from "react";
import type { BusinessProfile, BusinessProfileLog, BusinessProfileLogActionType } from "@/lib/types/business";
import type { BusinessProfileStatus } from "@/lib/types/business";
import type { MessageKey } from "@/lib/i18n/messages";
import { mapAdminStoreRowToBusinessProfile } from "@/lib/admin-business/map-admin-store-to-business";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
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

function mapAuditAction(action: string): BusinessProfileLogActionType {
  const a = action.toLowerCase();
  if (a.includes("approve")) return "approve";
  if (a.includes("reject")) return "reject";
  if (a.includes("suspend") || a.includes("pause")) return "pause";
  if (a.includes("resume")) return "resume";
  if (a.includes("apply")) return "apply";
  return "update_profile";
}

interface AdminBusinessDetailPageProps {
  profileId: string;
}

export function AdminBusinessDetailPage({ profileId }: AdminBusinessDetailPageProps) {
  const { t } = useI18n();
  const [refresh, setRefresh] = useState(0);
  const [memoInput, setMemoInput] = useState("");
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [logs, setLogs] = useState<BusinessProfileLog[]>([]);
  const [loading, setLoading] = useState(true);
  const refreshDetail = useCallback(() => setRefresh((r) => r + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch(`/api/admin/stores/${encodeURIComponent(profileId)}`, {
      cache: "no-store",
      credentials: "include",
    })
      .then((r) => r.json())
      .then(
        (j: {
          ok?: boolean;
          store?: StoreRow & Record<string, unknown>;
          ownerNickname?: string;
          logs?: Array<{ id: string; actionType: string; adminId: string; note: string; createdAt: string }>;
        }) => {
          if (cancelled) return;
          if (!j.ok || !j.store) {
            setProfile(null);
            setLogs([]);
            return;
          }
          setProfile(
            mapAdminStoreRowToBusinessProfile(j.store, String(j.ownerNickname ?? ""))
          );
          setLogs(
            (j.logs ?? []).map((log) => ({
              id: log.id,
              businessProfileId: profileId,
              actionType: mapAuditAction(log.actionType),
              adminId: log.adminId,
              adminNickname: log.adminId.slice(0, 8) || "—",
              note: log.note,
              createdAt: log.createdAt,
            }))
          );
        }
      )
      .catch(() => {
        if (!cancelled) {
          setProfile(null);
          setLogs([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, refresh]);

  if (loading) {
    return <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>;
  }

  if (!profile) {
    return (
      <div className="py-8 text-center sam-text-body text-sam-muted">
        {t("admin_biz_not_found")}
      </div>
    );
  }

  const handleSaveMemo = async () => {
    const res = await fetch(`/api/admin/stores/${encodeURIComponent(profileId)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_admin_memo", memo: memoInput }),
    });
    const j = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      alert(j.error ?? t("common_content_unavailable"));
      return;
    }
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
            <dd className="whitespace-pre-wrap text-sam-fg">{profile.description || "-"}</dd>
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
                {[profile.region, profile.city].filter((x) => String(x ?? "").trim()).join(" · ") || "—"}
              </div>
              {(profile.addressStreetLine ?? "").trim() || (profile.addressDetail ?? "").trim() ? (
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
              {profile.productCount} / {profile.reviewCount} / ★{profile.averageRating.toFixed(1)}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_biz_label_dates")}</dt>
            <dd className="sam-text-body-secondary text-sam-muted">
              {new Date(profile.createdAt).toLocaleString("ko-KR")}
              {profile.approvedAt && ` / ${new Date(profile.approvedAt).toLocaleString("ko-KR")}`}
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
            onClick={() => void handleSaveMemo()}
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
