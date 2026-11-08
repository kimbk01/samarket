"use client";

/**
 * 관리자 계정·권한 (`/admin/staff`, 설계 v4 F3) — 최고관리자 전용.
 * 조회 `GET /api/admin/staff/memberships` (활성 + 해제 이력). 쓰기는 기존 API 그대로:
 * 신규 계정 `CreateAdminForm` · 회원 승격 `PromoteMemberToAdminSheet` (POST /api/admin/staff) ·
 * 권한 변경 PATCH /api/admin/staff/[id] · 권한 해제 POST /api/admin/users/[id]/privilege (op=revoke, 사유).
 */

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminDetailDrawer } from "@/components/admin/ui/AdminDetailDrawer";
import { AdminStatusLabel } from "@/components/admin/ui/AdminStatusLabel";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminResultBanner,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import { MemberOpsListBody } from "@/components/admin/member-ops/MemberOpsListBody";
import { useMemberOpsPagedFetch } from "@/lib/admin/member-ops-list/use-member-ops-paged-fetch";
import { AdminFormSheet } from "@/components/admin/AdminFormSheet";
import { AdminPermissionToggles } from "@/components/admin/users/AdminPermissionToggles";
import { CreateAdminForm } from "@/components/admin/users/CreateAdminForm";
import { PromoteMemberToAdminSheet } from "@/components/admin/users/PromoteMemberToAdminSheet";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { DEFAULT_PERMISSIONS_BY_ROLE, getPermissionLabel } from "@/lib/admin-users/admin-permissions";
import { updateAdminStaffApi } from "@/lib/admin-users/admin-staff-api";
import { mutateMemberPrivilegeApi } from "@/lib/admin-users/member-admin-privilege-api";
import {
  ADMIN_STAFF_MEMBERSHIP_STATUS_NAMESPACE,
  ADMIN_STAFF_STATUS_FILTERS,
  adminStaffRevokeMatchText,
  type AdminStaffMembershipRow,
} from "@/lib/admin-users/admin-staff-membership-list";
import type { AdminRole } from "@/lib/admin-menu-config";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import { formatAdminShortId } from "@/components/admin/ui/AdminTechId";
import { catalogPair } from "@/lib/i18n/catalog-pair";

type Banner = { ok: true; message: string } | { ok: false; code: string } | null;

const ROLE_LABEL: Record<AdminRole, { ko: string; en: string }> = {
  master: catalogPair("admin_super_admin"),
  manager: catalogPair("admin_manager"),
  operator: catalogPair("admin_operator"),
};

const STATUS_OPTIONS = {
  active: catalogPair("admin_active"),
  revoked: catalogPair("admin_revoked_suspended"),
  all: catalogPair("admin_all_history"),
} as const;

const pht = (iso: string | null | undefined) => (iso ? `${formatAdminManilaDateTime(iso)} PHT` : "—");

type MemberHit = { id: string; nickname: string | null; email: string | null };

/** 승격할 회원 찾기 — 기존 회원 목록 API(관리 권한 없는 회원만). */
function PromoteMemberPicker({
  ko,
  onPick,
  onClose,
}: {
  ko: boolean;
  onPick: (hit: { id: string; name: string }) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<MemberHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const search = async () => {
    const term = q.trim();
    if (!term) return;
    setBusy(true);
    setErr(null);
    try {
      const params = new URLSearchParams({ search: term, privilege: "member", page: "1", pageSize: "20" });
      const res = await fetch(`/api/admin/users?${params.toString()}`, { credentials: "include", cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { users?: MemberHit[]; error?: string };
      if (!res.ok) {
        setErr(json.error ?? "load_failed");
        setHits([]);
        return;
      }
      setHits(json.users ?? []);
    } catch {
      setErr("network_error");
      setHits([]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminFormSheet
      title={t("admin_staff_find_member_promote")}
      subtitle={t("admin_staff_search_nickname_login_id_member_id")}
      onClose={onClose}
    >
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={100}
          className="h-10 flex-1 rounded-ui-rect border border-sam-border px-2.5 text-[16px]"
          placeholder={t("admin_staff_type_press_enter")}
        />
        <AdminActionButton type="submit" variant="primary" className="h-10" disabled={busy || !q.trim()}>
          {t("admin_staff_search")}
        </AdminActionButton>
      </form>
      {err ? <AdminErrorState ko={ko} code={err} /> : null}
      {hits && hits.length === 0 && !err ? <AdminEmptyState ko={ko} message={t("admin_staff_no_members_found")} /> : null}
      {hits && hits.length > 0 ? (
        <ul className="mt-3 divide-y divide-sam-border-soft rounded-ui-rect border border-sam-border">
          {hits.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2 px-3 py-2 text-[14px]">
              <span>
                {h.nickname || "—"}
                {h.email ? <span className="ml-2 text-[12px] text-sam-muted">{h.email}</span> : null}
              </span>
              <AdminActionButton type="button" onClick={() => onPick({ id: h.id, name: h.nickname || h.email || formatAdminShortId(h.id) })}>
                {t("admin_staff_select")}
              </AdminActionButton>
            </li>
          ))}
        </ul>
      ) : null}
    </AdminFormSheet>
  );
}

export function AdminStaffAccountsPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const lq = useAdminListQuery({
    defaults: { status: "active" },
    statuses: ADMIN_STAFF_STATUS_FILTERS,
  });
  const { query } = lq;

  const [banner, setBanner] = useState<Banner>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [picking, setPicking] = useState(false);
  const [promoteTarget, setPromoteTarget] = useState<{ id: string; name: string } | null>(null);

  // 권한 편집 (드로어)
  const [editRole, setEditRole] = useState<AdminRole>("operator");
  const [editPerms, setEditPerms] = useState<AdminPermissionKey[]>([]);
  const [pending, setPending] = useState(false);

  /** R7 — 서버 페이지(상태·검색·쪽 = 주소). 예전 1,000건 조회 + 화면 메모리 페이지 대체. 「전체 이력」= status=all. */
  const apiQs = useMemo(() => {
    const qs = new URLSearchParams(lq.apiQueryString);
    if (!qs.get("status")) qs.set("status", "all");
    return qs.toString();
  }, [lq.apiQueryString]);
  const list = useMemberOpsPagedFetch<AdminStaffMembershipRow>(
    `/api/admin/staff/memberships?${apiQs}`,
    "memberships",
    lq.refreshKey
  );
  const load = list.reload;
  const allRows = list.rows;
  const pageRows = allRows;
  const openRow = allRows.find((r) => r.membershipId === openId) ?? null;
  const editable = Boolean(openRow && openRow.status === "active" && openRow.uiRole !== "master");
  const dirty =
    editable &&
    openRow != null &&
    (editRole !== openRow.uiRole ||
      [...editPerms].sort().join(",") !== [...openRow.permissions].sort().join(","));

  const openDrawer = (row: AdminStaffMembershipRow) => {
    setOpenId(row.membershipId);
    setEditRole(row.uiRole === "master" ? "operator" : row.uiRole);
    setEditPerms([...row.permissions]);
  };

  const togglePerm = useCallback((key: AdminPermissionKey) => {
    setEditPerms((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  }, []);

  const roleLabel = (r: AdminRole) => (ko ? ROLE_LABEL[r].ko : ROLE_LABEL[r].en);
  const personLabel = (r: AdminStaffMembershipRow) => r.nickname || r.loginId || formatAdminShortId(r.userId);

  const saveChanges = async () => {
    if (!openRow) return;
    setPending(true);
    // 역할은 바뀐 경우에만 보낸다 (같은 역할 재부여로 멤버십을 다시 쓰지 않게).
    const result = await updateAdminStaffApi(openRow.userId, {
      ...(editRole !== openRow.uiRole ? { role: editRole } : {}),
      permissions: editPerms,
    });
    setPending(false);
    if (!result.ok) {
      setBanner({ ok: false, code: result.error });
      return;
    }
    setBanner({ ok: true, message: t("admin_staff_saved_permissions", { name: personLabel(openRow) }) });
    setOpenId(null);
    void load();
  };

  const revoke = async (reason: string) => {
    if (!openRow) return;
    setPending(true);
    const result = await mutateMemberPrivilegeApi({ userId: openRow.userId, op: "revoke", reason });
    setPending(false);
    if (!result.ok) {
      setBanner({ ok: false, code: result.error });
      return;
    }
    setBanner({ ok: true, message: t("admin_staff_revoked_admin_access", { name: personLabel(openRow) }) });
    setOpenId(null);
    void load();
  };

  /** 권한 변경 저장 = save(L1). */
  const askSave = async () => {
    if (!openRow) return;
    const c = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: t("admin_staff_save_permission_changes"),
      description: t("admin_staff_permissions", { name: personLabel(openRow), role: roleLabel(editRole), count: editPerms.length }),
      confirmLabel: t("admin_save"),
    });
    if (c.ok) await saveChanges();
  };

  /** 관리자 권한 해제 — 기존 확인(사유 + 대상 재입력)을 낮추지 않도록 L3(delete). 사유는 해제 API 로 보낸다. */
  const askRevoke = async () => {
    if (!openRow) return;
    const c = await confirmAdminAction({
      level: adminActionLevel("delete"),
      ko,
      title: t("admin_staff_revoke_admin_access"),
      description: t("admin_staff_they_will_lose_admin_access_member"),
      confirmLabel: t("admin_staff_revoke"),
      destructive: true,
      retypeValue: adminStaffRevokeMatchText(openRow),
      reasonPlaceholder: t("admin_staff_reason"),
    });
    if (!c.ok || !c.reason) return;
    await revoke(c.reason);
  };

  const onCreated = () => {
    setBanner({ ok: true, message: t("admin_staff_admin_account_created") });
    void load();
  };

  return (
    <div className="space-y-4" data-admin-staff-page="1">
      {/* 생성 버튼은 헤더 오른쪽 · 보조(secondary) — 화면의 primary 는 필터 바 [조회] 하나 (R7 버튼 배치). */}
      <div className="flex flex-wrap items-start justify-between gap-3">
      <AdminPageHeader
        titleKey="admin_menu_admin_staff"
        description={
          t("admin_staff_accounts_admin_access_their_revoke_history")
        }
      />
        <div className="flex flex-wrap gap-2">
          <AdminActionButton type="button" variant="secondary" onClick={() => setCreating(true)}>
            {t("admin_staff_create_admin_account")}
          </AdminActionButton>
          <AdminActionButton type="button" variant="secondary" onClick={() => setPicking(true)}>
            {t("admin_staff_promote_existing_member")}
          </AdminActionButton>
        </div>
      </div>


      <AdminResultBanner ko={ko} result={banner} onClose={() => setBanner(null)} />

      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        showPeriod={false}
        searchPlaceholder={t("admin_staff_nickname_login_id_member_id")}
        status={{
          value: query.status,
          onChange: lq.setStatus,
          label: t("admin_status"),
          options: ADMIN_STAFF_STATUS_FILTERS.map((s) => ({
            value: s === "all" ? "" : s,
            label: ko ? STATUS_OPTIONS[s].ko : STATUS_OPTIONS[s].en,
          })),
        }}
      />

      <MemberOpsListBody
        ko={ko}
        loading={list.loading}
        loaded={list.loaded}
        error={list.error}
        onRetry={lq.refresh}
        rowCount={pageRows.length}
        total={list.total}
        page={query.page}
        size={query.size}
        onPageChange={lq.setPage}
        onSizeChange={lq.setSize}
        isFiltered={lq.isFiltered}
        onReset={lq.reset}
      >
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[820px] border-collapse text-[14px]" data-admin-staff-table="1">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app text-left text-[13px] text-sam-muted">
                <th className="px-3 py-2 font-medium">{t("admin_admin")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_staff_role")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_status")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_staff_permissions_2")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_staff_granted_pht")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_staff_revoked_pht")}</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr
                  key={r.membershipId}
                  className="cursor-pointer border-b border-sam-border-soft hover:bg-sam-app"
                  onClick={() => openDrawer(r)}
                >
                  <td className="px-3 py-2">
                    <AdminActionButton variant="ghost" size="sm" className="!px-0 text-left">
                      {personLabel(r)}
                    </AdminActionButton>
                    {r.loginId && r.nickname ? <span className="ml-1.5 text-[12px] text-sam-muted">{r.loginId}</span> : null}
                  </td>
                  <td className="px-3 py-2">{roleLabel(r.uiRole)}</td>
                  <td className="px-3 py-2">
                    <AdminStatusLabel ko={ko} code={r.status} namespace={ADMIN_STAFF_MEMBERSHIP_STATUS_NAMESPACE} />
                  </td>
                  <td className="max-w-[260px] px-3 py-2 text-[13px] text-sam-muted">
                    <span className="line-clamp-2">
                      {r.uiRole === "master"
                        ? t("admin_staff_all_permissions")
                        : r.permissions.length === 0
                          ? "—"
                          : r.permissions.map(getPermissionLabel).join(", ")}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-[13px] text-sam-muted">
                    {pht(r.grantedAt)}
                    {r.grantedByNickname ? <div className="text-[12px]">{r.grantedByNickname}</div> : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-[13px] text-sam-muted">
                    {r.revokedAt ? pht(r.revokedAt) : "—"}
                    {r.revokedByNickname ? <div className="text-[12px]">{r.revokedByNickname}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </MemberOpsListBody>
      <AdminDetailDrawer
        open={openRow != null}
        onClose={() => setOpenId(null)}
        ko={ko}
        dirty={dirty}
        pending={pending}
        title={openRow ? personLabel(openRow) : ""}
        subtitle={openRow ? roleLabel(openRow.uiRole) : undefined}
        dangerActions={
          editable ? (
            /* 권한 해제는 재지정으로 되돌릴 수 있어 danger 가 아닌 보조 — 확인 단계(L3 사유 + 재입력)는 그대로. */
            <AdminActionButton type="button" variant="secondary" disabled={pending} onClick={() => void askRevoke()}>
              {t("admin_staff_revoke_admin_access_2")}
            </AdminActionButton>
          ) : null
        }
        primaryActions={
          editable ? (
            <AdminActionButton type="button" variant="primary" disabled={pending || !dirty} onClick={() => void askSave()}>
              {t("admin_save")}
            </AdminActionButton>
          ) : null
        }
      >
        {openRow ? (
          <div className="space-y-4 text-[14px]">
            <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5">
              <dt className="text-sam-muted">{t("admin_status")}</dt>
              <dd>
                <AdminStatusLabel ko={ko} code={openRow.status} namespace={ADMIN_STAFF_MEMBERSHIP_STATUS_NAMESPACE} />
              </dd>
              <dt className="text-sam-muted">{t("admin_staff_granted")}</dt>
              <dd>
                {pht(openRow.grantedAt)}
                {openRow.grantedByNickname ? ` · ${openRow.grantedByNickname}` : ""}
              </dd>
              {openRow.revokedAt ? (
                <>
                  <dt className="text-sam-muted">{t("admin_staff_revoked")}</dt>
                  <dd>
                    {pht(openRow.revokedAt)}
                    {openRow.revokedByNickname ? ` · ${openRow.revokedByNickname}` : ""}
                  </dd>
                  <dt className="text-sam-muted">{t("admin_staff_reason")}</dt>
                  <dd>{openRow.revokeReason || "—"}</dd>
                </>
              ) : null}
              <dt className="text-sam-muted">{t("admin_staff_member")}</dt>
              <dd>
                <Link href={`/admin/users/${openRow.userId}`} className="underline">
                  {t("admin_staff_open_member")}
                </Link>
              </dd>
            </dl>

            {editable ? (
              <div className="space-y-3 border-t border-sam-border pt-3">
                <label className="flex flex-col gap-1 text-[12px] font-medium text-sam-muted">
                  {t("admin_staff_role")}
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as AdminRole)}
                    className="h-10 rounded-ui-rect border border-sam-border px-2.5 text-[16px] text-sam-fg"
                  >
                    <option value="operator">{roleLabel("operator")}</option>
                    <option value="manager">{roleLabel("manager")}</option>
                  </select>
                </label>
                <AdminPermissionToggles
                  permissions={editPerms}
                  onToggle={togglePerm}
                  onApplyRoleDefaults={(r) => setEditPerms([...DEFAULT_PERMISSIONS_BY_ROLE[r]])}
                  canGrantCreateAdmin={true}
                  showRoleDefaultsButton={true}
                  currentRole={editRole}
                />
              </div>
            ) : (
              <p className="text-[13px] text-sam-muted">
                {openRow.uiRole === "master"
                  ? t("admin_staff_super_admin_access_cannot_changed_here")
                  : t("admin_staff_revoked_record_use_promote_existing_member")}
              </p>
            )}

            <AdminTechDetails ko={ko}>
              <p>user_id: {openRow.userId}</p>
              <p>membership_id: {openRow.membershipId}</p>
              <p>role: {openRow.role}</p>
              <p>admin_tier: {openRow.adminTier ?? "—"}</p>
              {openRow.grantedBy ? <p>granted_by: {openRow.grantedBy}</p> : null}
              {openRow.revokedBy ? <p>revoked_by: {openRow.revokedBy}</p> : null}
            </AdminTechDetails>
          </div>
        ) : null}
      </AdminDetailDrawer>

      {creating ? <CreateAdminForm onClose={() => setCreating(false)} onSuccess={onCreated} /> : null}
      {picking ? (
        <PromoteMemberPicker
          ko={ko}
          onClose={() => setPicking(false)}
          onPick={(hit) => {
            setPicking(false);
            setPromoteTarget(hit);
          }}
        />
      ) : null}
      {promoteTarget ? (
        <PromoteMemberToAdminSheet
          userId={promoteTarget.id}
          displayName={promoteTarget.name}
          onClose={() => setPromoteTarget(null)}
          onSuccess={() => {
            setBanner({
              ok: true,
              message: t("admin_staff_promoted", { name: promoteTarget.name }),
            });
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
