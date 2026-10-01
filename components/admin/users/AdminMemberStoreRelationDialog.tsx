"use client";

import Link from "next/link";
import { MemberAdminDialog } from "@/components/admin/users/MemberAdminDialog";
import type { AdminPersonStoreRow } from "@/components/admin/users/AdminTestUserDetail";
import { memberDetailStoreHref } from "@/lib/admin-users/member-detail-presentation";
import {
  MEMBER_STORE_RELATION_COPY,
  memberStoreApprovalStatusLabelKo,
  memberStoreRelationAnomalyCount,
  resolveCanonicalMemberStore,
} from "@/lib/admin-users/member-store-relation-ssot";

export function AdminMemberStoreRelationDialog({
  open,
  stores,
  onClose,
}: {
  open: boolean;
  stores: AdminPersonStoreRow[];
  onClose: () => void;
}) {
  const canonical = resolveCanonicalMemberStore(stores);
  const anomaly = memberStoreRelationAnomalyCount(stores) > 1;

  return (
    <MemberAdminDialog
      open={open}
      title={MEMBER_STORE_RELATION_COPY.dialog_title}
      description={MEMBER_STORE_RELATION_COPY.dialog_description}
      size="standard"
      dirty={false}
      pending={false}
      primaryLabel={MEMBER_STORE_RELATION_COPY.primary_confirm}
      onCancel={onClose}
      onPrimary={onClose}
      onClosed={onClose}
    >
      <div className="space-y-4" data-member-store-relation-dialog="1" data-member-screen="S27">
        {anomaly ? (
          <p className="rounded-ui-rect border border-[#fda29b] bg-[#fffbfa] px-3 py-2 text-[13px] text-[#b42318]">
            {MEMBER_STORE_RELATION_COPY.anomaly_multi}
          </p>
        ) : null}

        {!canonical ? (
          <div data-member-store-relation="none" className="space-y-1">
            <p className="text-sm font-semibold text-sam-fg">{MEMBER_STORE_RELATION_COPY.none_title}</p>
            <p className="text-[13px] text-sam-muted">{MEMBER_STORE_RELATION_COPY.none_body}</p>
          </div>
        ) : (
          <div data-member-store-relation="owned" className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-sam-muted">
              {MEMBER_STORE_RELATION_COPY.current_store}
            </p>
            <dl className="grid gap-2 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-sam-muted">{MEMBER_STORE_RELATION_COPY.store_name}</dt>
                <dd className="font-medium text-sam-fg">{canonical.name}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-sam-muted">{MEMBER_STORE_RELATION_COPY.store_id}</dt>
                <dd className="font-mono text-[12px] text-sam-fg">#{canonical.id}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-sam-muted">{MEMBER_STORE_RELATION_COPY.store_status}</dt>
                <dd className="font-medium text-sam-fg">
                  {memberStoreApprovalStatusLabelKo(canonical.approvalStatus)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-sam-muted">{MEMBER_STORE_RELATION_COPY.relationship}</dt>
                <dd className="font-medium text-sam-fg">
                  {MEMBER_STORE_RELATION_COPY.relationship_operator}
                </dd>
              </div>
            </dl>
            <Link
              href={memberDetailStoreHref(canonical.id)}
              className="inline-flex text-[13px] font-semibold text-[#2563eb]"
              data-member-store-detail-cta="1"
              data-member-cta-cap="CAP-STORE-VIEW"
            >
              {MEMBER_STORE_RELATION_COPY.view_store}
            </Link>
          </div>
        )}

        <div className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-app/40 px-3 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-sam-muted">허용되지 않는 작업</p>
          <div data-member-store-rel-blocked="attach">
            <p className="text-[13px] font-semibold text-sam-fg">{MEMBER_STORE_RELATION_COPY.cannot_attach}</p>
            <p className="text-[12px] text-sam-muted">{MEMBER_STORE_RELATION_COPY.cannot_attach_body}</p>
          </div>
          {canonical ? (
            <div data-member-store-rel-blocked="second" className="pt-1">
              <p className="text-[13px] font-semibold text-sam-fg">{MEMBER_STORE_RELATION_COPY.already_owns}</p>
              <p className="text-[12px] text-sam-muted">{MEMBER_STORE_RELATION_COPY.already_owns_body}</p>
            </div>
          ) : null}
          <div data-member-store-rel-blocked="transfer" className="pt-1">
            <p className="text-[13px] font-semibold text-sam-fg">{MEMBER_STORE_RELATION_COPY.transfer_forbidden}</p>
            <p className="text-[12px] text-sam-muted">{MEMBER_STORE_RELATION_COPY.transfer_forbidden_body}</p>
          </div>
          <div data-member-store-rel-blocked="detach" className="pt-1">
            <p className="text-[13px] font-semibold text-sam-fg">{MEMBER_STORE_RELATION_COPY.detach_forbidden}</p>
          </div>
        </div>
      </div>
    </MemberAdminDialog>
  );
}
