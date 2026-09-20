"use client";

/**
 * CUT 3 local Admin IA / action / status visual proof (dev only).
 */

import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { adminMenu, filterMenuForPublicSidebar } from "@/components/admin/admin-menu";
import { findAdminMenuByKey } from "@/lib/admin/find-admin-menu-item";
import { PROMOTION_ADMIN_ACTION_META } from "@/lib/admin/promotion-operation-actions";
import {
  PROMOTION_OPERATOR_STATUSES,
  promotionOperatorStatusLabel,
  promotionOperatorStatusTone,
} from "@/lib/admin/promotion-operation-status";

export function AdminPromotionIaProofClient() {
  const promo = findAdminMenuByKey(adminMenu, "promotion");
  const adsPublic = filterMenuForPublicSidebar(
    findAdminMenuByKey(adminMenu, "ads")?.children ?? []
  );

  return (
    <div className="min-h-screen space-y-6 bg-[var(--admin-console-bg)] p-4" data-admin="1" data-cut3-ia-proof="1">
      <h1 className="text-lg font-semibold text-[var(--admin-console-fg)]">
        CUT 3 — Admin Promotion IA Proof
      </h1>

      <section data-proof-nav="1" className="rounded-ui-rect border bg-white p-3">
        <h2 className="font-semibold">Promotion children</h2>
        <ul className="mt-2 flex flex-wrap gap-2 text-sm">
          {(promo?.children ?? []).map((c) => (
            <li key={c.key} data-proof-nav-child={c.key} className="rounded border px-2 py-1">
              {c.key}
              {c.path ? ` → ${c.path}` : ""}
            </li>
          ))}
        </ul>
      </section>

      <section data-proof-paid-ads="1" className="rounded-ui-rect border bg-white p-3">
        <h2 className="font-semibold">Paid Ads public leaves (separate)</h2>
        <ul className="mt-2 flex flex-wrap gap-2 text-sm">
          {adsPublic.map((c) => (
            <li key={c.key} className="rounded border px-2 py-1">
              {c.key}
            </li>
          ))}
        </ul>
      </section>

      <section data-proof-status="1" className="rounded-ui-rect border bg-white p-3">
        <h2 className="font-semibold">Status badges</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {PROMOTION_OPERATOR_STATUSES.map((s) => (
            <AdminToneBadge key={s} tone={promotionOperatorStatusTone(s)}>
              {promotionOperatorStatusLabel(s, "ko")}
            </AdminToneBadge>
          ))}
        </div>
      </section>

      <section data-proof-actions="1" className="rounded-ui-rect border bg-white p-3">
        <h2 className="font-semibold">Action buttons</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <AdminActionButton variant="primary" data-proof-btn="primary">
            {PROMOTION_ADMIN_ACTION_META.CREATE.labelKo}
          </AdminActionButton>
          <AdminActionButton variant="primary" data-proof-btn="primary-hover">
            {PROMOTION_ADMIN_ACTION_META.SAVE.labelKo}
          </AdminActionButton>
          <AdminActionButton variant="secondary" data-proof-btn="secondary">
            {PROMOTION_ADMIN_ACTION_META.PREVIEW.labelKo}
          </AdminActionButton>
          <AdminActionButton variant="secondary" data-proof-btn="configure">
            {PROMOTION_ADMIN_ACTION_META.CONFIGURE_EXPOSURE.labelKo}
          </AdminActionButton>
          <AdminActionButton variant="danger" data-proof-btn="danger">
            {PROMOTION_ADMIN_ACTION_META.PAUSE_STOP.labelKo}
          </AdminActionButton>
          <AdminActionButton variant="danger" data-proof-btn="send">
            {PROMOTION_ADMIN_ACTION_META.SEND_PUSH.labelKo}
          </AdminActionButton>
          <AdminActionButton variant="primary" data-proof-btn="approve">
            {PROMOTION_ADMIN_ACTION_META.APPROVE.labelKo}
          </AdminActionButton>
          <AdminActionButton variant="secondary" data-proof-btn="revision">
            {PROMOTION_ADMIN_ACTION_META.REQUEST_REVISION.labelKo}
          </AdminActionButton>
          <AdminActionButton variant="danger" data-proof-btn="reject">
            {PROMOTION_ADMIN_ACTION_META.REJECT.labelKo}
          </AdminActionButton>
          <AdminActionButton variant="primary" disabled data-proof-btn="disabled">
            {PROMOTION_ADMIN_ACTION_META.PUBLISH.labelKo}
          </AdminActionButton>
          <AdminActionButton variant="quiet" data-proof-btn="quiet">
            Quiet
          </AdminActionButton>
        </div>
      </section>
    </div>
  );
}
