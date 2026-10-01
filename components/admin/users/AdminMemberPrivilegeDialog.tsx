"use client";

import { useState } from "react";
import { MemberAdminDialog } from "@/components/admin/users/MemberAdminDialog";
import { mutateMemberPrivilegeApi } from "@/lib/admin-users/member-admin-privilege-api";
import {
  MEMBER_ADMIN_PRIVILEGE_COPY,
  memberPrivilegeLabelKo,
  type MemberPrivilegeMutationOp,
  type MemberPrivilegePresentation,
} from "@/lib/admin-users/member-admin-privilege-ssot";

export function AdminMemberPrivilegeDialog({
  open,
  op,
  userId,
  displayName,
  publicId,
  currentPrivilege,
  onClose,
  onSuccess,
}: {
  open: boolean;
  op: MemberPrivilegeMutationOp;
  userId: string;
  displayName: string;
  publicId?: string | null;
  currentPrivilege: MemberPrivilegePresentation;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const nextPrivilege: MemberPrivilegePresentation = op === "promote" ? "admin" : "member";
  const title = op === "promote" ? MEMBER_ADMIN_PRIVILEGE_COPY.promote_title : MEMBER_ADMIN_PRIVILEGE_COPY.revoke_title;
  const description =
    op === "promote" ? MEMBER_ADMIN_PRIVILEGE_COPY.promote_body : MEMBER_ADMIN_PRIVILEGE_COPY.revoke_body;
  const primaryLabel =
    op === "promote" ? MEMBER_ADMIN_PRIVILEGE_COPY.promote_primary : MEMBER_ADMIN_PRIVILEGE_COPY.revoke_primary;
  const consequence =
    op === "promote"
      ? MEMBER_ADMIN_PRIVILEGE_COPY.consequence_promote
      : MEMBER_ADMIN_PRIVILEGE_COPY.consequence_revoke;

  const handleClose = () => {
    if (pending) return;
    setErrorText(null);
    onClose();
  };

  const submit = async () => {
    setErrorText(null);
    setPending(true);
    try {
      const result = await mutateMemberPrivilegeApi({ userId, op });
      if (!result.ok) {
        setErrorText(result.errorKo);
        return;
      }
      onSuccess?.();
      onClose();
    } catch {
      setErrorText(MEMBER_ADMIN_PRIVILEGE_COPY.cannot_change);
    } finally {
      setPending(false);
    }
  };

  return (
    <MemberAdminDialog
      open={open}
      title={title}
      description={description}
      size="standard"
      dirty={false}
      pending={pending}
      errorText={errorText}
      primaryLabel={primaryLabel}
      tone={op === "revoke" ? "danger" : "default"}
      onCancel={handleClose}
      onPrimary={() => void submit()}
      onClosed={() => setErrorText(null)}
    >
      <div className="space-y-3" data-member-privilege-dialog="1" data-member-screen="S17" data-member-privilege-op={op}>
        <dl className="grid gap-2 text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="text-sam-muted">{MEMBER_ADMIN_PRIVILEGE_COPY.target_label}</dt>
            <dd className="text-right font-medium text-sam-fg">
              <span className="block">{displayName}</span>
              {publicId ? <span className="block font-mono text-[11px] text-sam-muted">@{publicId}</span> : null}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-sam-muted">{MEMBER_ADMIN_PRIVILEGE_COPY.current_label}</dt>
            <dd className="font-medium text-sam-fg">{memberPrivilegeLabelKo(currentPrivilege)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-sam-muted">{MEMBER_ADMIN_PRIVILEGE_COPY.next_label}</dt>
            <dd className="font-medium text-sam-fg">{memberPrivilegeLabelKo(nextPrivilege)}</dd>
          </div>
        </dl>
        <p className="rounded-ui-rect border border-sam-border bg-sam-app/40 px-3 py-2 text-[12px] text-sam-muted">
          {consequence}
        </p>
      </div>
    </MemberAdminDialog>
  );
}
