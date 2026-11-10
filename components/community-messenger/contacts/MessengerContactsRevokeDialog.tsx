"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayDialog } from "@/components/ui/dibay-overlay/DibayDialog";

/** OS 연락처 권한 철회 안내 (Owner #19) — 지우기 = 이 기기 연락처만 서버에서 삭제, 유지 = 업로드 중단만 */
export function MessengerContactsRevokeDialog({ open, onAnswer }: { open: boolean; onAnswer: (choice: "delete" | "keep") => Promise<boolean> }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<"delete" | "keep" | null>(null);
  const answer = async (choice: "delete" | "keep") => {
    setBusy(choice);
    await onAnswer(choice);
    setBusy(null);
  };
  return (
    <DibayDialog
      open={open}
      dismissible={false}
      title={t("cm_contacts_revoke_title")}
      description={t("cm_contacts_revoke_body")}
      actions={[
        { key: "keep", label: t("cm_contacts_revoke_keep"), roleTone: "secondary", onClick: () => void answer("keep"), loading: busy === "keep", disabled: busy !== null },
        { key: "delete", label: t("cm_contacts_revoke_delete"), roleTone: "destructive", onClick: () => void answer("delete"), loading: busy === "delete", disabled: busy !== null },
      ]}
    />
  );
}
