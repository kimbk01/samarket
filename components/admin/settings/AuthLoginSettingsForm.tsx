"use client";

import { useEffect, useState } from "react";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AuthProviderPublicMeta, OAuthProvider } from "@/lib/auth/auth-providers";
import type { AuthLoginSetting } from "@/lib/auth/login-settings";
import type { AuthDuplicateLoginPolicy } from "@/lib/auth/session-policy";
import type { AuthPhoneSettings } from "@/lib/auth/auth-phone-settings";

type EditableProvider = AuthProviderPublicMeta & { client_secret: string };

function toEditable(row: AuthProviderPublicMeta): EditableProvider {
  return {
    ...row,
    client_secret: "",
  };
}

function getProviderTitle(provider: OAuthProvider): string {
  if (provider === "google") return "Google";
  if (provider === "kakao") return "Kakao";
  if (provider === "naver") return "Naver";
  if (provider === "apple") return "Apple";
  return "Facebook";
}

export function AuthLoginSettingsForm() {
  const { t } = useI18n();
  const [providers, setProviders] = useState<EditableProvider[]>([]);
  const [legacySettings, setLegacySettings] = useState<AuthLoginSetting[]>([]);
  const [sessionPolicy, setSessionPolicy] = useState<AuthDuplicateLoginPolicy | null>(null);
  const [activeSection, setActiveSection] = useState<"oauth" | "policy" | "phone">("oauth");
  const [phoneSettings, setPhoneSettings] = useState<AuthPhoneSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [policySaving, setPolicySaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerSaving, setProviderSaving] = useState<Record<string, boolean>>({});
  const [providerStatus, setProviderStatus] = useState<Record<string, string | null>>({});
  const [providerError, setProviderError] = useState<Record<string, string | null>>({});
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [policySuccess, setPolicySuccess] = useState<string | null>(null);
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneSuccess, setPhoneSuccess] = useState<string | null>(null);

  const loadProviders = async () => {
    const providersRes = await fetch("/api/admin/auth-providers", {
      credentials: "include",
      cache: "no-store",
    });
    const providersJson = (await providersRes.json().catch(() => null)) as {
      ok?: boolean;
      providers?: AuthProviderPublicMeta[];
      error?: string;
    } | null;
    if (!providersRes.ok || !providersJson?.ok || !Array.isArray(providersJson.providers)) {
      throw new Error(providersJson?.error || t("admin_auth_err_load_providers"));
    }
    setProviders(providersJson.providers.map(toEditable));
  };

  const loadPolicy = async () => {
    const policyRes = await fetch("/api/admin/auth-settings", {
      credentials: "include",
      cache: "no-store",
    });
    const policyJson = (await policyRes.json().catch(() => null)) as {
      ok?: boolean;
      settings?: AuthLoginSetting[];
      sessionPolicy?: AuthDuplicateLoginPolicy;
      error?: string;
    } | null;
    if (!policyRes.ok || !policyJson?.ok || !Array.isArray(policyJson.settings) || !policyJson.sessionPolicy) {
      throw new Error(policyJson?.error || t("admin_auth_err_load_policy"));
    }
    setLegacySettings(policyJson.settings);
    setSessionPolicy(policyJson.sessionPolicy);
  };

  const loadPhoneSettings = async () => {
    const res = await fetch("/api/admin/settings/auth-phone", {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      settings?: AuthPhoneSettings;
      error?: string;
    } | null;
    if (!res.ok || !json?.ok || !json.settings) {
      throw new Error(json?.error || t("admin_auth_err_load_phone"));
    }
    setPhoneSettings(json.settings);
  };

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([loadProviders(), loadPolicy(), loadPhoneSettings()]);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("admin_auth_err_load_settings"));
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  const updateProvider = (provider: OAuthProvider, patch: Partial<EditableProvider>) => {
    setProviders((prev) => prev.map((row) => (row.provider === provider ? { ...row, ...patch } : row)));
  };

  const updatePolicy = (patch: Partial<AuthDuplicateLoginPolicy>) => {
    setSessionPolicy((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const updateLoginSetting = (provider: OAuthProvider, patch: Partial<AuthLoginSetting>) => {
    setLegacySettings((prev) =>
      prev.map((item) => (item.provider === provider ? { ...item, ...patch } : item))
    );
  };

  const saveProvider = async (provider: OAuthProvider): Promise<void> => {
    const row = providers.find((item) => item.provider === provider);
    if (!row) {
      setProviderError((prev) => ({ ...prev, [provider]: t("admin_auth_err_provider_not_found") }));
      return;
    }
    setProviderSaving((prev) => ({ ...prev, [provider]: true }));
    setProviderError((prev) => ({ ...prev, [provider]: null }));
    setProviderStatus((prev) => ({ ...prev, [provider]: null }));
    try {
      const payload: {
        provider: OAuthProvider;
        enabled: boolean;
        client_id: string;
        redirect_uri: string;
        scope: string;
        sort_order: number;
        client_secret?: string;
      } = {
        provider: row.provider,
        enabled: row.enabled,
        client_id: row.client_id,
        redirect_uri: row.redirect_uri,
        scope: row.scope,
        sort_order: row.sort_order,
      };
      const nextSecret = row.client_secret.trim();
      if (nextSecret.length > 0) {
        payload.client_secret = nextSecret;
      }
      const res = await fetch("/api/admin/auth-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        provider?: AuthProviderPublicMeta;
        error?: string;
      } | null;
      if (!res.ok || !json?.ok || !json.provider) {
        setProviderError((prev) => ({
          ...prev,
          [provider]: json?.error || t("admin_auth_err_provider_save", { provider: getProviderTitle(provider) }),
        }));
        return;
      }
      const refreshedProvider = json.provider;
      setProviders((prev) =>
        prev.map((item) =>
          item.provider === provider
            ? {
                ...item,
                ...toEditable(refreshedProvider),
                client_secret: row.client_secret,
              }
            : item
        )
      );
      if (sessionPolicy) {
        const policyRes = await fetch("/api/admin/auth-settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            settings: legacySettings,
            sessionPolicy,
          }),
        });
        const policyJson = (await policyRes.json().catch(() => null)) as {
          ok?: boolean;
          settings?: AuthLoginSetting[];
          error?: string;
        } | null;
        if (!policyRes.ok || !policyJson?.ok || !Array.isArray(policyJson.settings)) {
          setProviderError((prev) => ({
            ...prev,
            [provider]: policyJson?.error || t("admin_auth_err_login_display_save"),
          }));
          return;
        }
        setLegacySettings(policyJson.settings);
      }
      setProviderStatus((prev) => ({ ...prev, [provider]: "저장되었습니다." }));
    } catch {
      setProviderError((prev) => ({
        ...prev,
        [provider]: t("admin_auth_err_provider_save_failed", { provider: getProviderTitle(provider) }),
      }));
    } finally {
      setProviderSaving((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const savePolicy = async (): Promise<void> => {
    if (!sessionPolicy || legacySettings.length === 0) {
      setPolicyError(t("admin_auth_err_policy_not_ready"));
      return;
    }
    setPolicySaving((prev) => (prev ? prev : true));
    setPolicyError((prev) => (prev === null ? prev : null));
    setPolicySuccess((prev) => (prev === null ? prev : null));
    try {
      const res = await fetch("/api/admin/auth-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          settings: legacySettings,
          sessionPolicy,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        settings?: AuthLoginSetting[];
        sessionPolicy?: AuthDuplicateLoginPolicy;
        error?: string;
      } | null;
      if (!res.ok || !json?.ok || !Array.isArray(json.settings) || !json.sessionPolicy) {
        setPolicyError(json?.error || t("admin_auth_err_policy_save"));
        return;
      }
      setLegacySettings(json.settings);
      setSessionPolicy(json.sessionPolicy);
      setPolicySuccess(t("admin_settings_saved"));
    } catch {
      setPolicyError(t("admin_auth_err_policy_save"));
    } finally {
      setPolicySaving((prev) => (prev ? false : prev));
    }
  };

  const savePhoneSettings = async (): Promise<void> => {
    if (!phoneSettings) return;
    setPhoneSaving(true);
    setPhoneError(null);
    setPhoneSuccess(null);
    try {
      const res = await fetch("/api/admin/settings/auth-phone", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(phoneSettings),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        settings?: AuthPhoneSettings;
        error?: string;
      } | null;
      if (!res.ok || !json?.ok || !json.settings) {
        setPhoneError(json?.error || t("admin_auth_err_phone_save"));
        return;
      }
      setPhoneSettings(json.settings);
      setPhoneSuccess(t("admin_settings_saved"));
    } catch {
      setPhoneError(t("admin_auth_err_phone_save"));
    } finally {
      setPhoneSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_auth_settings_title" />
      <AdminCard title={t("admin_auth_settings_section_title")}>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveSection("oauth")}
            className={`rounded-ui-rect border px-3 py-2 text-sm font-medium ${
              activeSection === "oauth"
                ? "border-signature bg-signature/10 text-signature"
                : "border-sam-border bg-sam-surface text-sam-fg"
            }`}
          >
            {t("admin_auth_settings_oauth_tab")}
          </button>
          <button
            type="button"
            onClick={() => setActiveSection("policy")}
            className={`rounded-ui-rect border px-3 py-2 text-sm font-medium ${
              activeSection === "policy"
                ? "border-signature bg-signature/10 text-signature"
                : "border-sam-border bg-sam-surface text-sam-fg"
            }`}
          >
            {t("admin_auth_settings_policy_tab")}
          </button>
          <button
            type="button"
            onClick={() => setActiveSection("phone")}
            className={`rounded-ui-rect border px-3 py-2 text-sm font-medium ${
              activeSection === "phone"
                ? "border-signature bg-signature/10 text-signature"
                : "border-sam-border bg-sam-surface text-sam-fg"
            }`}
          >
            {t("admin_auth_settings_phone_tab")}
          </button>
        </div>
      </AdminCard>

      {activeSection === "oauth" ? (
        <AdminCard title={t("admin_auth_settings_oauth_card_title")}>
        {loading ? (
          <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>
        ) : (
          <div className="space-y-3">
            {providers.map((row) => (
              <div
                key={row.provider}
                className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4"
              >
                {(() => {
                  const setting = legacySettings.find((item) => item.provider === row.provider);
                  return (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="sam-text-body font-semibold text-sam-fg">
                      {setting?.label?.trim() || getProviderTitle(row.provider)}
                    </p>
                    <p className="sam-text-helper text-sam-muted">{row.provider}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 sam-text-body text-sam-fg">
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        onChange={(e) => updateProvider(row.provider, { enabled: e.target.checked })}
                      />
                      {t("admin_auth_label_enabled")}
                    </label>
                    <label className="flex items-center gap-2 sam-text-body text-sam-fg">
                      <input
                        type="checkbox"
                        checked={setting?.enabled === true}
                        onChange={(e) =>
                          updateLoginSetting(row.provider, { enabled: e.target.checked })
                        }
                      />
                      {t("admin_auth_label_login_visible")}
                    </label>
                  </div>
                </div>
                  );
                })()}
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="sam-text-body text-sam-fg">
                    <span className="mb-1 block sam-text-helper text-sam-muted">{t("admin_auth_settings_label_provider_name")}</span>
                    <input
                      type="text"
                      value={legacySettings.find((item) => item.provider === row.provider)?.label ?? getProviderTitle(row.provider)}
                      onChange={(e) =>
                        updateLoginSetting(row.provider, { label: e.target.value.trim() || getProviderTitle(row.provider) })
                      }
                      className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
                    />
                  </label>
                  <label className="sam-text-body text-sam-fg">
                    <span className="mb-1 block sam-text-helper text-sam-muted">{t("admin_auth_settings_label_sort_order")}</span>
                    <input
                      type="number"
                      min={1}
                      value={row.sort_order}
                      onChange={(e) =>
                        updateProvider(row.provider, { sort_order: Number(e.target.value) || 1 })
                      }
                      className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
                    />
                  </label>
                  <label className="sam-text-body text-sam-fg">
                    <span className="mb-1 block sam-text-helper text-sam-muted">Client ID</span>
                    <input
                      type="text"
                      value={row.client_id}
                      onChange={(e) => updateProvider(row.provider, { client_id: e.target.value })}
                      className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
                    />
                  </label>
                  <label className="sam-text-body text-sam-fg">
                    <span className="mb-1 block sam-text-helper text-sam-muted">Client Secret</span>
                    <input
                      type="password"
                      value={row.client_secret}
                      onChange={(e) => updateProvider(row.provider, { client_secret: e.target.value })}
                      className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
                      autoComplete="new-password"
                    />
                    <span className="mt-1 block sam-text-helper text-sam-muted">
                      {t("admin_auth_secret_status", {
                        status: row.client_secret_configured
                          ? t("admin_auth_secret_configured")
                          : t("admin_auth_secret_not_configured"),
                      })}
                    </span>
                  </label>
                  <label className="sam-text-body text-sam-fg">
                    <span className="mb-1 block sam-text-helper text-sam-muted">
                      {t("admin_auth_callback_url_label")}
                    </span>
                    <input
                      type="url"
                      value={row.redirect_uri}
                      onChange={(e) => updateProvider(row.provider, { redirect_uri: e.target.value })}
                      className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
                    />
                    <span className="mt-1 block sam-text-helper text-sam-muted">
                      {t("admin_auth_settings_oauth_callback_guide")}
                    </span>
                  </label>
                </div>
                <label className="sam-text-body text-sam-fg">
                  <span className="mb-1 block sam-text-helper text-sam-muted">Scope</span>
                  <input
                    type="text"
                    value={row.scope}
                    onChange={(e) => updateProvider(row.provider, { scope: e.target.value })}
                    className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
                  />
                </label>
                {providerError[row.provider] ? (
                  <p className="sam-text-body-secondary text-red-600">{providerError[row.provider]}</p>
                ) : null}
                {providerStatus[row.provider] ? (
                  <p className="sam-text-body-secondary text-emerald-600">{providerStatus[row.provider]}</p>
                ) : null}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void saveProvider(row.provider)}
                    disabled={providerSaving[row.provider] === true}
                    className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white disabled:opacity-50"
                  >
                    {providerSaving[row.provider] ? t("common_saving") : `${getProviderTitle(row.provider)} ${t("common_save")}`}
                  </button>
                </div>
              </div>
            ))}
            {error ? <p className="sam-text-body-secondary text-red-600">{error}</p> : null}
          </div>
        )}
      </AdminCard>
      ) : activeSection === "policy" ? (
      <AdminCard title={t("admin_auth_settings_policy_card_title")}>
        {loading || !sessionPolicy ? (
          <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>
        ) : (
          <div className="space-y-3">
            <p className="sam-text-body-secondary text-sam-muted">{t("admin_auth_policy_intro")}</p>
            <label className="flex items-center gap-2 sam-text-body text-sam-fg">
              <input
                type="checkbox"
                checked={sessionPolicy.compare_same_login_id}
                onChange={(e) => updatePolicy({ compare_same_login_id: e.target.checked })}
              />
              {t("admin_auth_policy_same_login_id")}
            </label>
            <label className="flex items-center gap-2 sam-text-body text-sam-fg">
              <input
                type="checkbox"
                checked={sessionPolicy.compare_same_device}
                onChange={(e) => updatePolicy({ compare_same_device: e.target.checked })}
                disabled={!sessionPolicy.compare_same_login_id}
              />
              {t("admin_auth_policy_same_device")}
            </label>
            <label className="flex items-center gap-2 sam-text-body text-sam-fg">
              <input
                type="checkbox"
                checked={sessionPolicy.compare_same_browser}
                onChange={(e) => updatePolicy({ compare_same_browser: e.target.checked })}
                disabled={!sessionPolicy.compare_same_login_id}
              />
              {t("admin_auth_policy_same_browser")}
            </label>
            <label className="flex items-center gap-2 sam-text-body text-sam-fg">
              <input
                type="checkbox"
                checked={sessionPolicy.compare_same_ip}
                onChange={(e) => updatePolicy({ compare_same_ip: e.target.checked })}
                disabled={!sessionPolicy.compare_same_login_id}
              />
              {t("admin_auth_policy_same_ip")}
            </label>
            {!sessionPolicy.compare_same_login_id ? (
              <p className="sam-text-body-secondary text-amber-700">{t("admin_auth_policy_disabled_warning")}</p>
            ) : null}
            {policyError ? <p className="sam-text-body-secondary text-red-600">{policyError}</p> : null}
            {policySuccess ? <p className="sam-text-body-secondary text-emerald-600">{policySuccess}</p> : null}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void savePolicy()}
                disabled={policySaving || legacySettings.length === 0}
                className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white disabled:opacity-50"
              >
                {policySaving ? t("common_saving") : t("common_save")}
              </button>
            </div>
          </div>
        )}
      </AdminCard>
      ) : (
      <AdminCard title={t("admin_auth_settings_phone_card_title")}>
        {loading || !phoneSettings ? (
          <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>
        ) : (
          <div className="space-y-3">
            <label className="flex items-center gap-2 sam-text-body text-sam-fg">
              <input
                type="checkbox"
                checked={phoneSettings.enabled === true}
                onChange={(e) =>
                  setPhoneSettings((prev) => (prev ? { ...prev, enabled: e.target.checked } : prev))
                }
              />
              {t("admin_auth_phone_enabled")}
            </label>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="sam-text-body text-sam-fg">
                <span className="mb-1 block sam-text-helper text-sam-muted">{t("admin_auth_settings_label_country")}</span>
                <input value="PH" disabled className="w-full rounded-ui-rect border border-sam-border px-3 py-2 bg-sam-app" />
              </label>
              <label className="sam-text-body text-sam-fg">
                <span className="mb-1 block sam-text-helper text-sam-muted">Provider</span>
                <select
                  value={phoneSettings.provider}
                  onChange={(e) =>
                    setPhoneSettings((prev) =>
                      prev
                        ? {
                            ...prev,
                            provider: e.target.value === "supabase" ? "supabase" : "semaphore",
                          }
                        : prev
                    )
                  }
                  className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
                >
                  <option value="semaphore">semaphore</option>
                  <option value="supabase">supabase</option>
                </select>
              </label>
              <label className="sam-text-body text-sam-fg">
                <span className="mb-1 block sam-text-helper text-sam-muted">{t("admin_auth_settings_label_sms_from")}</span>
                <input
                  value={phoneSettings.sms_from_name ?? ""}
                  onChange={(e) =>
                    setPhoneSettings((prev) =>
                      prev ? { ...prev, sms_from_name: e.target.value } : prev
                    )
                  }
                  className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
                />
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="sam-text-body text-sam-fg">
                <span className="mb-1 block sam-text-helper text-sam-muted">{t("admin_auth_settings_label_otp_ttl")}</span>
                <input
                  type="number"
                  min={60}
                  value={phoneSettings.otp_ttl_seconds}
                  onChange={(e) =>
                    setPhoneSettings((prev) =>
                      prev ? { ...prev, otp_ttl_seconds: Number(e.target.value) || 300 } : prev
                    )
                  }
                  className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
                />
              </label>
              <label className="sam-text-body text-sam-fg">
                <span className="mb-1 block sam-text-helper text-sam-muted">{t("admin_auth_settings_label_resend_cooldown")}</span>
                <input
                  type="number"
                  min={10}
                  value={phoneSettings.resend_cooldown_seconds}
                  onChange={(e) =>
                    setPhoneSettings((prev) =>
                      prev ? { ...prev, resend_cooldown_seconds: Number(e.target.value) || 60 } : prev
                    )
                  }
                  className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
                />
              </label>
              <label className="sam-text-body text-sam-fg">
                <span className="mb-1 block sam-text-helper text-sam-muted">{t("admin_auth_settings_label_max_attempts")}</span>
                <input
                  type="number"
                  min={1}
                  value={phoneSettings.max_attempts}
                  onChange={(e) =>
                    setPhoneSettings((prev) =>
                      prev ? { ...prev, max_attempts: Number(e.target.value) || 5 } : prev
                    )
                  }
                  className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
                />
              </label>
            </div>
            <label className="sam-text-body text-sam-fg">
              <span className="mb-1 block sam-text-helper text-sam-muted">{t("admin_auth_settings_label_guide_text")}</span>
              <textarea
                rows={3}
                value={phoneSettings.guide_text}
                onChange={(e) =>
                  setPhoneSettings((prev) =>
                    prev ? { ...prev, guide_text: e.target.value } : prev
                  )
                }
                className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
              />
            </label>
            {phoneSettings.provider === "supabase" ? (
              <div className="rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-2 sam-text-body-secondary text-amber-900">
                {t("admin_auth_phone_supabase_hint")}
              </div>
            ) : (
              <div className="rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-2 sam-text-body-secondary text-amber-900">
                {t("admin_auth_phone_semaphore_hint")}
              </div>
            )}
            {phoneError ? <p className="sam-text-body-secondary text-red-600">{phoneError}</p> : null}
            {phoneSuccess ? <p className="sam-text-body-secondary text-emerald-600">{phoneSuccess}</p> : null}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void savePhoneSettings()}
                disabled={phoneSaving}
                className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white disabled:opacity-50"
              >
                {phoneSaving ? t("common_saving") : t("admin_auth_settings_phone_save")}
              </button>
            </div>
          </div>
        )}
      </AdminCard>
      )}
    </div>
  );
}
