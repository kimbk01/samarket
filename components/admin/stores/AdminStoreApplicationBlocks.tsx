"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { ReviewBlock, ReviewRow, ReviewAddressValue } from "@/components/admin/stores/admin-store-review-ui";
import type { AdminStoreReviewRow } from "@/components/admin/stores/admin-store-review-model";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { formatPhMobileDisplayPlus63 } from "@/lib/utils/ph-mobile";
import type { MessageKey } from "@/lib/i18n/messages";
import type { StoreApplicationEventRow } from "@/lib/stores/store-application-step";

type ApplicationAux = {
  events: StoreApplicationEventRow[];
  nameDuplicates: { id: string; store_name: string; approval_status: string }[];
  memberPhone: string | null;
  memberPhoneVerified: boolean;
};

const EVENT_ACTION_KEY: Record<string, MessageKey> = {
  submit: "admin_store_app_event_submit",
  start_review: "admin_store_app_event_start_review",
  mark_under_review: "admin_store_app_event_start_review",
  approve_store: "admin_store_app_event_approve",
  reject_store: "admin_store_app_event_reject",
  request_revision: "admin_store_app_event_revision",
  reopen_application: "admin_store_app_event_reopen",
  resubmit: "admin_store_app_event_resubmit",
  suspend_store: "admin_store_app_event_suspend",
  resume_store: "admin_store_app_event_resume",
};

function dash(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  return s || "—";
}

/**
 * 입점 심사 패널 — 신청자 · 매장(신청 내용) · 처리 이력 · 운영 정보 (매장 신청 v2 · Owner 2026-11-10).
 * - 신청자 블록: 실명 · 회원 아이디 · 회원 전화(프로필) · 신청자 대표 주소(회원 — 매장 위치 아님).
 * - 매장 블록: 신청서 항목 그대로 — 매장 전화(매장 전용 인증 배지) · 카카오 · 실제 영업장 위치 · 같은 이름 매장.
 * - GCash 두 줄은 신청서에 없는 값 → 승인·정지 매장의 「운영 정보」 블록에만.
 */
export function AdminStoreApplicationBlocks({
  store,
  catDb,
  topicDb,
  storeIntro,
  gcashNoDisplay,
  profileUrl,
}: {
  store: AdminStoreReviewRow;
  catDb: string;
  topicDb: string;
  storeIntro: string | null | undefined;
  gcashNoDisplay: string;
  profileUrl: string | null | undefined;
}) {
  const { t } = useI18n();
  const [aux, setAux] = useState<ApplicationAux | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAux(null);
    void fetch(`/api/admin/stores/${encodeURIComponent(store.id)}/application`, { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j: ApplicationAux & { ok?: boolean }) => {
        if (!cancelled && j?.ok) setAux(j);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [store.id, store.approval_status, store.updated_at]);

  const phone = (store.phone ?? "").trim();
  const loc = (store.formatted_address ?? "").trim();
  const hasCoords = typeof store.lat === "number" && typeof store.lng === "number";
  const mapsHref = hasCoords ? `https://www.google.com/maps/search/?api=1&query=${store.lat},${store.lng}` : null;
  const approvedish = store.approval_status === "approved" || store.approval_status === "suspended";

  return (
    <>
      <ReviewBlock title={t("admin_stores_section_applicant")}>
        <ReviewRow label={t("admin_stores_field_nickname")} value={dash(store.applicant_nickname)} />
        <ReviewRow label={t("admin_stores_field_owner_handle")} value={dash(store.owner_handle || store.owner_username)} />
        <ReviewRow
          label={t("admin_store_app_member_phone")}
          value={
            aux?.memberPhone ? (
              <span className="tabular-nums">
                {formatPhMobileDisplayPlus63(aux.memberPhone) || aux.memberPhone}{" "}
                <span className="text-[12px] text-sam-muted">{t("admin_store_app_member_phone_hint")}</span>
              </span>
            ) : (
              "—"
            )
          }
        />
        <ReviewRow label={t("admin_store_app_applicant_address")} value={<ReviewAddressValue store={store} />} />
      </ReviewBlock>

      <ReviewBlock title={t("admin_store_app_store_block")}>
        <ReviewRow
          label={t("admin_store_app_store_name")}
          value={
            <span className="flex flex-wrap items-center gap-1.5">
              <span>{dash(store.store_name)}</span>
              {aux && aux.nameDuplicates.length > 0 ? (
                <AdminToneBadge tone="warning">
                  {t("admin_store_app_name_dup", { count: aux.nameDuplicates.length })}
                </AdminToneBadge>
              ) : null}
            </span>
          }
        />
        {aux && aux.nameDuplicates.length > 0 ? (
          <ReviewRow
            label={t("admin_store_app_name_dup_list")}
            value={
              <ul className="space-y-0.5">
                {aux.nameDuplicates.map((d) => (
                  <li key={d.id}>
                    <a className="text-sam-primary underline" href={`/admin/business/${encodeURIComponent(d.id)}`}>
                      {d.store_name}
                    </a>
                  </li>
                ))}
              </ul>
            }
          />
        ) : null}
        {store.branch_name?.trim() ? <ReviewRow label={t("admin_store_app_branch")} value={store.branch_name.trim()} /> : null}
        <ReviewRow label={t("admin_stores_field_category_primary")} value={catDb || "—"} />
        <ReviewRow label={t("admin_stores_field_category_secondary")} value={topicDb || "—"} />
        <ReviewRow
          label={t("admin_store_app_store_phone")}
          value={
            phone ? (
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="tabular-nums">{formatPhMobileDisplayPlus63(phone) || phone}</span>
                {store.phone_verified_at ? (
                  <AdminToneBadge tone="success">
                    {t("admin_store_app_phone_verified", {
                      at: `${formatAdminManilaDateTime(store.phone_verified_at)} PHT`,
                    })}
                  </AdminToneBadge>
                ) : (
                  <AdminToneBadge tone="neutral">{t("admin_store_app_phone_no_record")}</AdminToneBadge>
                )}
              </span>
            ) : (
              "—"
            )
          }
        />
        <ReviewRow label={t("admin_store_app_kakao")} value={dash(store.kakao_id)} />
        <ReviewRow
          label={t("admin_store_app_location")}
          value={
            loc || hasCoords ? (
              <span className="block">
                <span className="block">{loc || "—"}</span>
                {store.address_line2?.trim() ? <span className="block">{store.address_line2.trim()}</span> : null}
                {mapsHref ? (
                  <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="text-[13px] text-sam-primary underline">
                    {t("admin_store_app_open_map")}
                  </a>
                ) : null}
              </span>
            ) : (
              <span className="text-sam-muted">{t("admin_store_app_location_none")}</span>
            )
          }
        />
        {storeIntro?.trim() ? (
          <ReviewRow label={t("admin_stores_section_intro")} value={<span className="whitespace-pre-wrap">{storeIntro.trim()}</span>} />
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
            value={<span className="whitespace-pre-wrap text-sam-warning">{store.revision_note.trim()}</span>}
          />
        ) : null}
        {store.rejected_reason?.trim() ? (
          <ReviewRow
            label={t("admin_stores_section_reject_reason")}
            value={<span className="whitespace-pre-wrap text-sam-danger">{store.rejected_reason.trim()}</span>}
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
              <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="block max-w-xs overflow-hidden rounded-sm border border-sam-border">
                <img src={profileUrl} alt="" className="max-h-40 w-full object-cover" />
              </a>
            }
          />
        ) : null}
      </ReviewBlock>

      <ReviewBlock title={t("admin_store_app_history")}>
        {!aux ? (
          <p className="px-1 text-[13px] text-sam-muted">{t("common_loading")}</p>
        ) : aux.events.length === 0 ? (
          <p className="px-1 text-[13px] text-sam-muted">{t("admin_store_app_history_empty")}</p>
        ) : (
          <ol className="space-y-1.5 text-[13px]">
            {aux.events.map((e, i) => (
              <li key={e.id ?? `${e.created_at}-${i}`} className="flex flex-wrap gap-x-2">
                <span className="tabular-nums text-sam-muted">{formatAdminManilaDateTime(e.created_at)} PHT</span>
                <span className="font-semibold text-sam-fg">
                  {EVENT_ACTION_KEY[e.action] ? t(EVENT_ACTION_KEY[e.action]!) : e.action}
                </span>
                <span className="text-sam-muted">
                  {e.actor_type === "owner" ? t("admin_store_app_actor_owner") : e.actor_type === "admin" ? t("admin_store_app_actor_admin") : ""}
                </span>
                {e.reason ? <span className="w-full whitespace-pre-wrap text-sam-fg">{e.reason}</span> : null}
              </li>
            ))}
          </ol>
        )}
      </ReviewBlock>

      {approvedish ? (
        <ReviewBlock title={t("admin_store_app_ops_block")}>
          <ReviewRow label={t("admin_stores_gcash_number")} value={gcashNoDisplay} />
          <ReviewRow label={t("admin_stores_gcash_account_name")} value={dash(store.website_url)} />
        </ReviewBlock>
      ) : null}
    </>
  );
}
