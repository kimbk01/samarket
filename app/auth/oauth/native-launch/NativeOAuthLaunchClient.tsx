"use client";

import { useEffect, useRef, useState } from "react";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayAuthLogo } from "@/components/auth/DibayAuthLogo";
import { OAUTH_BROWSER_OPEN_TIMEOUT_MS } from "@/lib/auth/oauth/start-oauth-login";

type Props = {
  authorizeUrl: string;
};

export function NativeOAuthLaunchClient({ authorizeUrl }: Props) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    void (async () => {
      if (!Capacitor.isPluginAvailable("Browser")) {
        setError(t("auth_err_oauth_browser_plugin_unavailable"));
        return;
      }

      try {
        await Promise.race([
          Browser.open({ url: authorizeUrl }),
          new Promise<never>((_, reject) => {
            window.setTimeout(() => reject(new Error("browser_open_timeout")), OAUTH_BROWSER_OPEN_TIMEOUT_MS);
          }),
        ]);
      } catch {
        setError(t("auth_err_oauth_browser_open_failed"));
      }
    })();
  }, [authorizeUrl, t]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-sam-app px-6">
      <DibayAuthLogo size={56} />
      <p className="mt-4 text-center text-base font-medium text-sam-fg">
        {error ? error : t("auth_oauth_redirecting_label")}
      </p>
      {error ? (
        <button
          type="button"
          className="mt-4 text-sm font-medium text-sam-brand underline"
          onClick={() => {
            startedRef.current = false;
            setError(null);
            void Browser.open({ url: authorizeUrl }).catch(() => {
              setError(t("auth_err_oauth_browser_open_failed"));
            });
          }}
        >
          {t("auth_oauth_launch_retry_label")}
        </button>
      ) : (
        <p className="mt-2 text-center sam-text-body-secondary text-sam-muted">
          {t("auth_oauth_launch_body")}
        </p>
      )}
    </div>
  );
}
