"use client";

/**
 * 관리자 계정·권한 (`/admin/staff`, 설계 v4 F3) — 최고관리자 전용.
 * 조회 `GET /api/admin/staff/memberships` (활성 + 해제 이력). 쓰기는 기존 API 그대로:
 * 신규 계정 `CreateAdminForm` · 회원 승격 `PromoteMemberToAdminSheet` (POST /api/admin/staff) ·
 * 권한 변경 PATCH /api/admin/staff/[id] · 권한 해제 POST /api/admin/users/[id]/privilege (op=revoke, 사유).
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { AdminDetailDrawer } from "@/components/admin/ui/AdminDetailDrawer";
import { AdminStatusLabel } from "@/components/admin/ui/AdminStatusLabel";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminActionConfirmDialog } from "@/components/admin/ui/AdminActionConfirmDialog";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
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
  filterAdminStaffMemberships,
  parseAdminStaffStatusFilter,
  type AdminStaffMembershipRow,
} from "@/lib/admin-users/admin-staff-membership-list";
import type { AdminRole } from "@/lib/admin-menu-config";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";

type LoadState =
  | { status: "loading" }
  | { status: "error"; code: string; httpStatus?: number }
  | { status: "ok"; rows: AdminStaffMembershipRow[] };

type Banner = { ok: true; message: string } | { ok: false; code: string } | null;

const ROLE_LABEL: Record<AdminRole, { ko: string; en: string }> = {
  master: { ko: "최고관리자", en: "Super admin" },
  manager: { ko: "매니저", en: "Manager" },
  operator: { ko: "운영자", en: "Operator" },
};

const STATUS_OPTIONS = {
  active: { ko: "사용 중", en: "Active" },
  revoked: { ko: "해제·정지", en: "Revoked / suspended" },
  all: { ko: "전체 이력", en: "All history" },
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
      title={ko ? "관리자로 지정할 회원 찾기" : "Find a member to promote"}
      subtitle={ko ? "닉네임·아이디·회원 ID 로 검색합니다." : "Search by nickname, login ID or member ID."}
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
          placeholder={ko ? "검색어 입력 후 Enter" : "Type and press Enter"}
        />
        <AdminActionButton type="submit" variant="primary" className="h-10" disabled={busy || !q.trim()}>
          {ko ? "찾기" : "Search"}
        </AdminActionButton>
      </form>
      {err ? <AdminErrorState ko={ko} code={err} /> : null}
      {hits && hits.length === 0 && !err ? <AdminEmptyState ko={ko} message={ko ? "일치하는 회원이 없습니다." : "No members found."} /> : null}
      {hits && hits.length > 0 ? (
        <ul className="mt-3 divide-y divide-sam-border-soft rounded-ui-rect border border-sam-border">
          {hits.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2 px-3 py-2 text-[14px]">
              <span>
                {h.nickname || "—"}
                {h.email ? <span className="ml-2 text-[12px] text-sam-muted">{h.email}</span> : null}
              </span>
              <AdminActionButton type="button" onClick={() => onPick({ id: h.id, name: h.nickname || h.email || h.id.slice(0, 8) })}>
                {ko ? "선택" : "Select"}
              </AdminActionButton>
            </li>
          ))}
        </ul>
      ) : null}
    </AdminFormSheet>
  );
}

export function AdminStaffAccountsPage() {
  const { language } = useI18n();
  const ko = language !== "en";
  const lq = useAdminListQuery({
    defaults: { status: "active" },
    statuses: ADMIN_STAFF_STATUS_FILTERS,
  });
  const { query } = lq;
  const statusFilter = parseAdminStaffStatusFilter(query.status || "all");

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [banner, setBanner] = useState<Banner>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [picking, setPicking] = useState(false);
  const [promoteTarget, setPromoteTarget] = useState<{ id: string; name: string } | null>(null);

  // 권한 편집 (드로어)
  const [editRole, setEditRole] = useState<AdminRole>("operator");
  const [editPerms, setEditPerms] = useState<AdminPermissionKey[]>([]);
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/admin/staff/memberships", { credentials: "include", cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        memberships?: AdminStaffMembershipRow[];
      };
      if (!res.ok || !json.ok) {
        setState({ status: "error", code: json.error ?? "load_failed", httpStatus: res.status });
        return;
      }
      setState({ status: "ok", rows: json.memberships ?? [] });
    } catch {
      setState({ status: "error", code: "network_error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const allRows = useMemo(() => (state.status === "ok" ? state.rows : []), [state]);
  const filtered = useMemo(
    () => filterAdminStaffMemberships(allRows, statusFilter, query.q),
    [allRows, statusFilter, query.q]
  );
  const pageRows = filtered.slice((query.page - 1) * query.size, query.page * query.size);
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
  const personLabel = (r: AdminStaffMembershipRow) => r.nickname || r.loginId || r.userId.slice(0, 8);

  const saveChanges = async () => {
    if (!openRow) return;
    setPending(true);
    // 역할은 바뀐 경우에만 보낸다 (같은 역할 재부여로 멤버십을 다시 쓰지 않게).
    const result = await updateAdminStaffApi(openRow.userId, {
      ...(editRole !== openRow.uiRole ? { role: editRole } : {}),
      permissions: editPerms,
    });
    setPending(false);
    setConfirmSave(false);
    if (!result.ok) {
      setBanner({ ok: false, code: result.error });
      return;
    }
    setBanner({ ok: true, message: ko ? `「${personLabel(openRow)}」 권한을 저장했습니다.` : `Saved permissions for 「${personLabel(openRow)}」.` });
    setOpenId(null);
    void load();
  };

  const revoke = async (reason: string) => {
    if (!openRow) return;
    setPending(true);
    const result = await mutateMemberPrivilegeApi({ userId: openRow.userId, op: "revoke", reason });
    setPending(false);
    setConfirmRevoke(false);
    if (!result.ok) {
      setBanner({ ok: false, code: result.error });
      return;
    }
    setBanner({ ok: true, message: ko ? `「${personLabel(openRow)}」 관리자 권한을 해제했습니다.` : `Revoked admin access for 「${personLabel(openRow)}」.` });
    setOpenId(null);
    void load();
  };

  const onCreated = () => {
    setBanner({ ok: true, message: ko ? "관리자 계정을 만들었습니다." : "Admin account created." });
    void load();
  };

  return (
    <div className="space-y-4" data-admin-staff-page="1">
      <AdminPageHeader
        title={ko ? "관리자 계정·권한" : "Admin accounts & permissions"}
        description={
          ko
            ? "관리자 권한을 가진 계정과 해제 이력입니다. 권한 해제는 회원 계정을 지우지 않습니다."
            : "Accounts with admin access and their revoke history. Revoking never deletes the member account."
        }
      />

      <div className="flex flex-wrap gap-2">
        <AdminActionButton type="button" variant="primary" onClick={() => setCreating(true)}>
          {ko ? "관리자 계정 만들기" : "Create admin account"}
        </AdminActionButton>
        <AdminActionButton type="button" onClick={() => setPicking(true)}>
          {ko ? "기존 회원을 관리자로 지정" : "Promote existing member"}
        </AdminActionButton>
      </div>

      <AdminResultBanner ko={ko} result={banner} onClose={() => setBanner(null)} />

      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        showPeriod={false}
        searchPlaceholder={ko ? "닉네임·아이디·회원 ID" : "Nickname, login ID or member ID"}
        status={{
          value: query.status,
          onChange: lq.setStatus,
          label: ko ? "상태" : "Status",
          options: ADMIN_STAFF_STATUS_FILTERS.map((s) => ({
            value: s === "all" ? "" : s,
            label: ko ? STATUS_OPTIONS[s].ko : STATUS_OPTIONS[s].en,
          })),
        }}
      />

      {state.status === "loading" ? (
        <AdminLoadingState ko={ko} />
      ) : state.status === "error" ? (
        <AdminErrorState ko={ko} code={state.code} httpStatus={state.httpStatus} onRetry={() => void load()} />
      ) : filtered.length === 0 ? (
        <AdminEmptyState ko={ko} />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[820px] border-collapse text-[14px]" data-admin-staff-table="1">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app text-left text-[13px] text-sam-muted">
                <th className="px-3 py-2 font-medium">{ko ? "관리자" : "Admin"}</th>
                <th className="px-3 py-2 font-medium">{ko ? "역할" : "Role"}</th>
                <th className="px-3 py-2 font-medium">{ko ? "상태" : "Status"}</th>
                <th className="px-3 py-2 font-medium">{ko ? "권한" : "Permissions"}</th>
                <th className="px-3 py-2 font-medium">{ko ? "부여 (PHT)" : "Granted (PHT)"}</th>
                <th className="px-3 py-2 font-medium">{ko ? "해제 (PHT)" : "Revoked (PHT)"}</th>
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
                    <button type="button" className="text-left font-medium text-sam-fg hover:underline">
                      {personLabel(r)}
                    </button>
                    {r.loginId && r.nickname ? <span className="ml-1.5 text-[12px] text-sam-muted">{r.loginId}</span> : null}
                  </td>
                  <td className="px-3 py-2">{roleLabel(r.uiRole)}</td>
                  <td className="px-3 py-2">
                    <AdminStatusLabel ko={ko} code={r.status} namespace={ADMIN_STAFF_MEMBERSHIP_STATUS_NAMESPACE} />
                  </td>
                  <td className="max-w-[260px] px-3 py-2 text-[13px] text-sam-muted">
                    <span className="line-clamp-2">
                      {r.uiRole === "master"
                        ? ko
                          ? "전체 권한"
                          : "All permissions"
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
      )}

      {state.status === "ok" && filtered.length > 0 ? (
        <AdminPagination
          ko={ko}
          page={query.page}
          size={query.size}
          total={filtered.length}
          onPageChange={lq.setPage}
          onSizeChange={lq.setSize}
        />
      ) : null}

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
            <AdminActionButton type="button" variant="danger" disabled={pending} onClick={() => setConfirmRevoke(true)}>
              {ko ? "관리자 권한 해제" : "Revoke admin access"}
            </AdminActionButton>
          ) : null
        }
        primaryActions={
          editable ? (
            <AdminActionButton type="button" variant="primary" disabled={pending || !dirty} onClick={() => setConfirmSave(true)}>
              {ko ? "저장" : "Save"}
            </AdminActionButton>
          ) : null
        }
      >
        {openRow ? (
          <div className="space-y-4 text-[14px]">
            <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5">
              <dt className="text-sam-muted">{ko ? "상태" : "Status"}</dt>
              <dd>
                <AdminStatusLabel ko={ko} code={openRow.status} namespace={ADMIN_STAFF_MEMBERSHIP_STATUS_NAMESPACE} />
              </dd>
              <dt className="text-sam-muted">{ko ? "부여" : "Granted"}</dt>
              <dd>
                {pht(openRow.grantedAt)}
                {openRow.grantedByNickname ? ` · ${openRow.grantedByNickname}` : ""}
              </dd>
              {openRow.revokedAt ? (
                <>
                  <dt className="text-sam-muted">{ko ? "해제" : "Revoked"}</dt>
                  <dd>
                    {pht(openRow.revokedAt)}
                    {openRow.revokedByNickname ? ` · ${openRow.revokedByNickname}` : ""}
                  </dd>
                  <dt className="text-sam-muted">{ko ? "해제 사유" : "Reason"}</dt>
                  <dd>{openRow.revokeReason || "—"}</dd>
                </>
              ) : null}
              <dt className="text-sam-muted">{ko ? "회원 상세" : "Member"}</dt>
              <dd>
                <Link href={`/admin/users/${openRow.userId}`} className="underline">
                  {ko ? "회원 화면 열기" : "Open member"}
                </Link>
              </dd>
            </dl>

            {editable ? (
              <div className="space-y-3 border-t border-sam-border pt-3">
                <label className="flex flex-col gap-1 text-[12px] font-medium text-sam-muted">
                  {ko ? "역할" : "Role"}
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
                  ? ko
                    ? "최고관리자 권한은 이 화면에서 바꾸거나 해제할 수 없습니다."
                    : "Super admin access cannot be changed here."
                  : ko
                    ? "해제된 기록입니다. 다시 지정하려면 「기존 회원을 관리자로 지정」을 쓰세요."
                    : "This is a revoked record. Use 「Promote existing member」 to grant again."}
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

      <AdminActionConfirmDialog
        open={confirmSave}
        title={ko ? "권한 변경을 저장할까요?" : "Save permission changes?"}
        description={
          openRow
            ? ko
              ? `「${personLabel(openRow)}」 · ${roleLabel(editRole)} · 권한 ${editPerms.length}개`
              : `「${personLabel(openRow)}」 · ${roleLabel(editRole)} · ${editPerms.length} permissions`
            : ""
        }
        confirmLabel={ko ? "저장" : "Save"}
        cancelLabel={ko ? "취소" : "Cancel"}
        pending={pending}
        onCancel={() => setConfirmSave(false)}
        onConfirm={() => void saveChanges()}
      />

      <AdminActionConfirmDialog
        open={confirmRevoke}
        tone="danger"
        title={ko ? "관리자 권한을 해제할까요?" : "Revoke admin access?"}
        description={
          ko
            ? "관리자 화면에 더 이상 들어올 수 없습니다. 회원 계정과 데이터는 그대로 남습니다."
            : "They will lose Admin access. The member account and data stay."
        }
        confirmLabel={ko ? "권한 해제" : "Revoke"}
        cancelLabel={ko ? "취소" : "Cancel"}
        reasonRequired
        reasonLabel={ko ? "해제 사유" : "Reason"}
        confirmMatchText={openRow ? adminStaffRevokeMatchText(openRow) : undefined}
        confirmMatchLabel={
          openRow
            ? ko
              ? `확인을 위해 「${adminStaffRevokeMatchText(openRow)}」 를 입력하세요`
              : `Type 「${adminStaffRevokeMatchText(openRow)}」 to confirm`
            : undefined
        }
        pending={pending}
        onCancel={() => setConfirmRevoke(false)}
        onConfirm={(reason) => void revoke(reason)}
      />

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
              message: ko ? `「${promoteTarget.name}」 을(를) 관리자로 지정했습니다.` : `Promoted 「${promoteTarget.name}」.`,
            });
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
