"use client";

import { useEffect } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import type { CallV3Context } from "@/lib/call-v3/call-v3-types";

type Props = {
  ctx: CallV3Context;
};

export function DibayMissedCallToast({ ctx }: Props) {
  const { t } = useI18n();

  useEffect(() => {
    if (ctx.state !== "missed") return;
    showMessengerSnackbar(t("cm_ui_missed_call_notification"));
  }, [ctx.state, t]);

  return null;
}
