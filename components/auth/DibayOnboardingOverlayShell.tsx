"use client";

import type { ReactNode } from "react";
import { DibayAuthLogo } from "@/components/auth/DibayAuthLogo";
import { AuthGateOverlay } from "@/components/auth/AuthGateOverlay";
import {
  DIBAY_ONBOARDING_DESC_CLASS,
  DIBAY_ONBOARDING_STEP_BADGE_CLASS,
  DIBAY_ONBOARDING_TITLE_CLASS,
} from "@/lib/ui/dibay-onboarding-starbucks-styles";

type DibayOnboardingOverlayShellProps = {
  /** Omit when the flow has no further step (consent-only signup — B6: no misleading "1/2"). */
  step?: 1 | 2;
  title: string;
  description?: string;
  titleId: string;
  descriptionId?: string;
  headerExtra?: ReactNode;
  children: ReactNode;
};

export function DibayOnboardingOverlayShell({
  step,
  title,
  description,
  titleId,
  descriptionId,
  headerExtra,
  children,
}: DibayOnboardingOverlayShellProps) {
  return (
    <AuthGateOverlay open labelledBy={titleId} describedBy={descriptionId} role="dialog">
      <div className="mx-auto flex justify-center" aria-hidden>
        <DibayAuthLogo size={52} />
      </div>
      {step ? (
        <div className="mt-3 flex justify-center">
          <span className={DIBAY_ONBOARDING_STEP_BADGE_CLASS}>{step}/2</span>
        </div>
      ) : null}
      <h1 id={titleId} className={`mt-3 ${DIBAY_ONBOARDING_TITLE_CLASS}`}>
        {title}
      </h1>
      {description ? (
        <p id={descriptionId} className={DIBAY_ONBOARDING_DESC_CLASS}>
          {description}
        </p>
      ) : null}
      {headerExtra ? <div className="mt-3">{headerExtra}</div> : null}
      <div className="mt-5">{children}</div>
    </AuthGateOverlay>
  );
}
