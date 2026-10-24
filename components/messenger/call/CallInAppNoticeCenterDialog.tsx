"use client";

import Image from "next/image";
import { AlertTriangle, Info, PhoneOff } from "lucide-react";
import { DibayDialog } from "@/components/ui/dibay-overlay";
import type { DibayOverlayAction } from "@/components/ui/dibay-overlay";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DIBAY_LOGO_MARK_PATH, dibayBrandAssetUrl } from "@/lib/brand/brand-asset-paths";
import { getCallInAppNoticeCenterCopy } from "@/lib/community-messenger/call-ui/call-in-app-notice-center-copy";
import type { CallInAppNoticeCenterTone } from "@/lib/community-messenger/call-ui/call-in-app-notice-center-copy";
import { useCallInAppNoticeStore } from "@/lib/community-messenger/stores/call-in-app-notice-store";
import "./call-in-app-notice-center.css";

const LOGO_SRC = dibayBrandAssetUrl(DIBAY_LOGO_MARK_PATH);

/**
 * E-C3 — web center notice on DibayDialog / Overlay SSOT (not a new modal system).
 * Does not change global DibayInfoDialog visuals for other screens.
 * Native Activity/VC overlays remain out of scope.
 */
export function CallInAppNoticeCenterDialog() {
  const { safeT } = useI18n();
  const current = useCallInAppNoticeStore((s) => s.current);
  const dismiss = useCallInAppNoticeStore((s) => s.dismiss);

  const event = current?.spec.presentation === "CENTER" ? current.event : null;
  const copy = event ? getCallInAppNoticeCenterCopy(event) : null;
  const open = Boolean(copy);

  const title = copy
    ? safeT(copy.titleKey, {
        fallbackKo: copy.fallbackTitleKo,
        fallbackEn: copy.fallbackTitleEn,
      })
    : "";
  const body = copy
    ? safeT(copy.bodyKey, {
        fallbackKo: copy.fallbackBodyKo,
        fallbackEn: copy.fallbackBodyEn,
      })
    : "";

  const confirmLabel = safeT("common_confirm", { fallbackKo: "확인", fallbackEn: "Confirm" });

  const onConfirm = () => {
    if (event) dismiss(event);
    else dismiss();
  };

  const actions: DibayOverlayAction[] = [
    {
      key: "ok",
      label: confirmLabel,
      roleTone: "primary",
      onClick: onConfirm,
    },
  ];

  return (
    <DibayDialog
      open={open}
      onClose={onConfirm}
      dismissible
      title={
        <span className="flex flex-col items-center gap-3">
          <span data-cm-call-notice-center="1" className="cm-call-notice-center-brand">
            <Image
              src={LOGO_SRC}
              alt=""
              width={44}
              height={44}
              unoptimized
              className="cm-call-notice-center-logo"
              priority={false}
            />
            <span
              className={`cm-call-notice-center-icon cm-call-notice-center-icon--${copy?.tone ?? "info"}`}
              aria-hidden
            >
              {toneIcon(copy?.tone ?? "info")}
            </span>
          </span>
          <span className="block w-full text-center">{title}</span>
        </span>
      }
      description={<span className="block w-full text-center leading-[1.6]">{body}</span>}
      actions={actions}
      actionsLayout="stack"
      ariaLabel={title || confirmLabel}
    />
  );
}

function toneIcon(tone: CallInAppNoticeCenterTone) {
  const className = "h-6 w-6";
  if (tone === "failure") return <AlertTriangle className={className} strokeWidth={2.25} />;
  if (tone === "attention") return <PhoneOff className={className} strokeWidth={2.25} />;
  return <Info className={className} strokeWidth={2.25} />;
}
