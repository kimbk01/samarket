/**
 * ARO-OPS-UX-002-B6 — Support Control Plane loader.
 * Composes support_cases only. No new tables / Messenger merge.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildAdminSupportCaseRoute,
  type SupportCaseRow,
} from "@/lib/support/support-case-types";
import { resolveSupportReferenceAdminHref } from "@/lib/support/support-reference-admin-href";
import { businessCcFinancialStatementHref } from "@/lib/admin-business/business-control-center-links";
import type {
  SupportActionRow,
  SupportControlPlaneModel,
} from "@/lib/admin/support-control-plane/types";

function isMissing(err: { message?: string } | null | undefined): boolean {
  return !!err && /support_cases|schema cache|does not exist/i.test(String(err.message ?? ""));
}

function ageHours(iso: string): number | null {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 3600000));
}

function ageLabel(hours: number | null): { ko: string; en: string } {
  if (hours == null) return { ko: "—", en: "—" };
  if (hours < 1) return { ko: "1시간 미만", en: "<1h" };
  if (hours < 24) return { ko: `${hours}시간`, en: `${hours}h` };
  const days = Math.floor(hours / 24);
  return { ko: `${days}일`, en: `${days}d` };
}

function isActionable(status: string): boolean {
  return status === "OPEN" || status === "WAITING_ADMIN";
}

function toRow(c: SupportCaseRow): SupportActionRow {
  const at = c.last_message_at || c.created_at;
  const hours = ageHours(at);
  const age = ageLabel(hours);
  const ref = resolveSupportReferenceAdminHref(c.reference_type, c.reference_id);
  const storeId = c.owner_store_id ? String(c.owner_store_id) : null;
  const adsRelated =
    c.reference_type === "AD_CAMPAIGN" ||
    c.reference_type === "DELIVERY_AD_CAMPAIGN" ||
    c.reference_type === "FEED_AD_REQUEST" ||
    c.reference_type === "PLATFORM_POPUP_OWNER_REQUEST";

  return {
    id: c.id,
    publicCaseNo: c.public_case_no,
    requesterType: c.audience,
    requesterUserId: c.requester_user_id,
    storeId,
    subject: c.subject || c.initial_summary || c.public_case_no,
    category: c.category,
    issueType: c.issue_type,
    referenceType: c.reference_type,
    referenceId: c.reference_id,
    status: c.status,
    priority: c.priority,
    assignedAdminId: c.assigned_admin_id,
    lastMessageAt: at,
    createdAt: c.created_at,
    ageHours: hours,
    ageLabelKo: age.ko,
    ageLabelEn: age.en,
    adminUnread: Number(c.admin_unread_count) || 0,
    href: buildAdminSupportCaseRoute(c.id),
    contextHref: ref?.href ?? null,
    contextLabelKo: ref?.labelKo ?? null,
    contextLabelEn: ref?.labelEn ?? null,
    statementHref: storeId ? businessCcFinancialStatementHref(storeId) : null,
    financeHref: storeId
      ? `/admin/finance?storeId=${encodeURIComponent(storeId)}#action-required`
      : "/admin/finance#action-required",
    adsHref: adsRelated ? "/admin/delivery-ads/manage#action-required" : null,
    source: "support_cases",
  };
}

export async function loadSupportControlPlane(
  sb: SupabaseClient
): Promise<SupportControlPlaneModel> {
  const sectionErrors: string[] = [];

  const { data, error } = await sb
    .from("support_cases")
    .select("*")
    .order("last_message_at", { ascending: true })
    .limit(120);

  const unavailable = !!error && !isMissing(error);
  if (error && !isMissing(error)) sectionErrors.push(`support_cases:${error.message}`);

  const rows = unavailable || isMissing(error) ? [] : ((data ?? []) as SupportCaseRow[]);
  const mapped = rows.map(toRow);

  const actionable = mapped
    .filter((r) => isActionable(r.status))
    .sort((a, b) => new Date(a.lastMessageAt).getTime() - new Date(b.lastMessageAt).getTime());

  const member = mapped.filter((r) => r.requesterType === "MEMBER" && isActionable(r.status));
  const owner = mapped.filter((r) => r.requesterType === "OWNER" && isActionable(r.status));
  const waitingUser = mapped.filter((r) => r.status === "WAITING_USER");
  const inProgress = mapped.filter(
    (r) => r.status === "WAITING_USER" || (isActionable(r.status) && !!r.assignedAdminId)
  );
  const resolved = mapped.filter((r) => r.status === "RESOLVED" || r.status === "ARCHIVED");
  const aging = actionable.filter((r) => (r.ageHours ?? 0) >= 24).slice(0, 20);
  const cat = (r: SupportActionRow) => String(r.category ?? "").toUpperCase();
  const finance = actionable.filter((r) =>
    /POINT|CASH|COIN|SETTLEMENT|FINANCE|WITHDRAW|PAYMENT/.test(cat(r))
  );
  const ads = actionable.filter(
    (r) =>
      !!r.adsHref ||
      /AD|ADS|PROMOTE|POPUP|CAMPAIGN/.test(cat(r)) ||
      /AD_|CAMPAIGN|FEED_AD|POPUP/.test(String(r.referenceType ?? "").toUpperCase())
  );
  const order = actionable.filter(
    (r) =>
      cat(r) === "ORDER" ||
      cat(r) === "ORDER_DELIVERY" ||
      String(r.referenceType ?? "").toUpperCase() === "STORE_ORDER"
  );
  const recent = [...mapped]
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
    .slice(0, 20);

  return {
    generatedAt: new Date().toISOString(),
    actionRequired: actionable.slice(0, 40),
    queues: {
      actionable: {
        count: unavailable ? null : actionable.length,
        unavailable,
        href: "/admin/support?filter=ACTIONABLE#action-required",
        source: "support_cases OPEN|WAITING_ADMIN",
      },
      inProgress: {
        count: unavailable ? null : inProgress.length,
        unavailable,
        href: "/admin/support?filter=WAITING_USER",
        source: "WAITING_USER or assigned actionable",
      },
      overdue: {
        count: unavailable ? null : aging.length,
        unavailable,
        href: "/admin/support?filter=ACTIONABLE#aging",
        source: "actionable ageHours >= 24",
      },
      member: {
        count: unavailable ? null : member.length,
        unavailable,
        href: "/admin/support?filter=MEMBER#action-required",
        source: "support_cases audience=MEMBER actionable",
      },
      owner: {
        count: unavailable ? null : owner.length,
        unavailable,
        href: "/admin/support?filter=OWNER#action-required",
        source: "support_cases audience=OWNER actionable",
      },
      finance: {
        count: unavailable ? null : finance.length,
        unavailable,
        href: "/admin/support?filter=ACTIONABLE#finance-inquiries",
        source: "category finance-like actionable",
      },
      ads: {
        count: unavailable ? null : ads.length,
        unavailable,
        href: "/admin/support?filter=ACTIONABLE#ads-inquiries",
        source: "ads-related actionable",
      },
      order: {
        count: unavailable ? null : order.length,
        unavailable,
        href: "/admin/support?filter=ACTIONABLE#order-inquiries",
        source: "ORDER category actionable",
      },
      waitingUser: {
        count: unavailable ? null : waitingUser.length,
        unavailable,
        href: "/admin/support?filter=WAITING_USER",
        source: "support_cases WAITING_USER",
      },
      resolved: {
        count: unavailable ? null : resolved.length,
        unavailable,
        href: "/admin/support?filter=RESOLVED",
        source: "support_cases RESOLVED|ARCHIVED",
      },
    },
    memberInquiries: member.slice(0, 20),
    ownerInquiries: owner.slice(0, 20),
    financeInquiries: finance.slice(0, 20),
    adsInquiries: ads.slice(0, 20),
    orderInquiries: order.slice(0, 20),
    aging,
    recent,
    domainEntries: [
      {
        id: "archive",
        labelKo: "이전 문의 기록",
        labelEn: "Legacy inquiry archive",
        href: "/admin/support/archive",
        frequency: "ARCHIVE",
      },
      {
        id: "finance",
        labelKo: "재무 관제 (B4)",
        labelEn: "Finance control plane (B4)",
        href: "/admin/finance#action-required",
        frequency: "FREQUENT",
      },
      {
        id: "ads",
        labelKo: "광고/노출 관제 (B5)",
        labelEn: "Ads / Exposure (B5)",
        href: "/admin/delivery-ads/manage#action-required",
        frequency: "FREQUENT",
      },
      {
        id: "action_center",
        labelKo: "전역 Action Center",
        labelEn: "Global Action Center",
        href: "/admin#action-center",
        frequency: "DAILY_CRITICAL",
      },
    ],
    sectionErrors,
  };
}
