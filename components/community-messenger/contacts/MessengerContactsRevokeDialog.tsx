"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayDialog } from "@/components/ui/dibay-overlay/DibayDialog";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";

/**
 * OS 연락처 권한 철회 안내 (Owner #19 · 시안 「연락처 권한이 꺼졌어요」) — 「이미 올린 n개」를 보여 준다.
 * 지우기 = 이 기기 연락처만 서버에서 삭제, 유지 = 업로드 중단만. 결과는 안내(스낵바)로 알린다.
 */
export function MessengerContactsRevokeDialog({
  open,
  count,
  onAnswer,
}: {
  open: boolean;
  /** 철회 감지 시점 이 기기 번호 수 (0 이면 개수 없이 안내) */
  count: number;
  onAnswer: (choice: "delete" | "keep") => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<"delete" | "keep" | null>(null);
  const answer = async (choice: "delete" | "keep") => {
    setBusy(choice);
    const ok = await onAnswer(choice).catch(() => false);
    setBusy(null);
    if (!ok) showMessengerSnackbar(t("cm_contacts_action_failed"), { variant: "error" });
    else if (choice === "delete") showMessengerSnackbar(t("cm_contacts_deleted"));
  };
  return (
    <DibayDialog
      open={open}
      dismissible={false}
      title={t("cm_contacts_revoke_title")}
      description={count > 0 ? t("cm_contacts_revoke_body_count", { count }) : t("cm_contacts_revoke_body")}
      actions={[
        { key: "keep", label: t("cm_contacts_revoke_keep"), roleTone: "secondary", onClick: () => void answer("keep"), loading: busy === "keep", disabled: busy !== null },
        { key: "delete", label: t("cm_contacts_revoke_delete"), roleTone: "destructive", onClick: () => void answer("delete"), loading: busy === "delete", disabled: busy !== null },
      ]}
    />
  );
}
