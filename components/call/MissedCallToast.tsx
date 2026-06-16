"use client";

import { useEffect } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import type { CallContext } from "@/lib/call/call-types";

type Props = {
  ctx: CallContext;
};

export function MissedCallToast({ ctx }: Props) {
  const { t } = useI18n();

  useEffect(() => {
    if (ctx.state !== "missed") return;
    showMessengerSnackbar(t("cm_ui_missed_call_notification"));
  }, [ctx.state, t]);

  return null;
}
