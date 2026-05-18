"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";

export type OwnerStorePagePhase =
  | { kind: "loading" }
  | { kind: "need_store_id"; profile?: boolean }
  | { kind: "unauth" }
  | { kind: "config" }
  | { kind: "not_found" }
  | { kind: "error"; message: string }
  | { kind: "ok" };

type Props = {
  phase: OwnerStorePagePhase;
  onRetry?: () => void;
  children?: React.ReactNode;
};

export function OwnerStorePagePhaseGate({ phase, onRetry, children }: Props) {
  const { t } = useI18n();

  if (phase.kind === "loading") {
    return <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>;
  }
  if (phase.kind === "need_store_id") {
    return (
      <div className={`${OWNER_STORE_STACK_Y_CLASS} sam-text-body text-sam-muted`}>
        <p>{phase.profile ? t("owner_store_profile_need_store_id") : t("owner_store_need_store_id")}</p>
        <Link href="/stores/owner" className="font-medium text-signature underline">
          {t("owner_store_back_link")}
        </Link>
      </div>
    );
  }
  if (phase.kind === "unauth") {
    return <p className="sam-text-body text-amber-900">{t("common_login_required")}</p>;
  }
  if (phase.kind === "config") {
    return <p className="sam-text-body text-sam-muted">{t("owner_store_supabase_hint")}</p>;
  }
  if (phase.kind === "not_found") {
    return (
      <div className={`${OWNER_STORE_STACK_Y_CLASS} sam-text-body text-sam-muted`}>
        <p>{t("owner_store_not_found")}</p>
        <Link href="/stores/owner" className="font-medium text-signature underline">
          {t("owner_store_back_link")}
        </Link>
      </div>
    );
  }
  if (phase.kind === "error") {
    return (
      <div className={OWNER_STORE_STACK_Y_CLASS}>
        <p className="sam-text-body text-red-600">{phase.message}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={() => onRetry()}
            className="sam-text-body font-medium text-signature underline"
          >
            {t("common_retry")}
          </button>
        ) : null}
      </div>
    );
  }
  return <>{children}</>;
}
