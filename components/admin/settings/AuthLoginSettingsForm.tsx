"use client";

import { useEffect, useState } from "react";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { AuthProviderPublic, OAuthProvider } from "@/lib/auth/auth-providers";
import type { AuthLoginSetting } from "@/lib/auth/login-settings";
import type { AuthDuplicateLoginPolicy } from "@/lib/auth/session-policy";

type EditableProvider = AuthProviderPublic & { client_secret: string };

function toEditable(row: AuthProviderPublic): EditableProvider {
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
  const [providers, setProviders] = useState<EditableProvider[]>([]);
  const [legacySettings, setLegacySettings] = useState<AuthLoginSetting[]>([]);
  const [sessionPolicy, setSessionPolicy] = useState<AuthDuplicateLoginPolicy | null>(null);
  const [activeSection, setActiveSection] = useState<"oauth" | "policy">("oauth");
  const [loading, setLoading] = useState(true);
  const [policySaving, setPolicySaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerSaving, setProviderSaving] = useState<Record<string, boolean>>({});
  const [providerStatus, setProviderStatus] = useState<Record<string, string | null>>({});
  const [providerError, setProviderError] = useState<Record<string, string | null>>({});
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [policySuccess, setPolicySuccess] = useState<string | null>(null);

  const loadProviders = async () => {
    const providersRes = await fetch("/api/admin/auth-providers", {
      credentials: "include",
      cache: "no-store",
    });
    const providersJson = (await providersRes.json().catch(() => null)) as {
      ok?: boolean;
      providers?: AuthProviderPublic[];
      error?: string;
    } | null;
    if (!providersRes.ok || !providersJson?.ok || !Array.isArray(providersJson.providers)) {
      throw new Error(providersJson?.error || "SNS Auth 설정을 불러오지 못했습니다.");
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
      throw new Error(policyJson?.error || "중복 로그인 정책을 불러오지 못했습니다.");
    }
    setLegacySettings(policyJson.settings);
    setSessionPolicy(policyJson.sessionPolicy);
  };

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([loadProviders(), loadPolicy()]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "설정을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updateProvider = (provider: OAuthProvider, patch: Partial<EditableProvider>) => {
    setProviders((prev) => prev.map((row) => (row.provider === provider ? { ...row, ...patch } : row)));
  };

  const updatePolicy = (patch: Partial<AuthDuplicateLoginPolicy>) => {
    setSessionPolicy((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const saveProvider = async (provider: OAuthProvider): Promise<void> => {
    const row = providers.find((item) => item.provider === provider);
    if (!row) {
      setProviderError((prev) => ({ ...prev, [provider]: "저장할 Provider 데이터를 찾지 못했습니다." }));
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
        provider?: AuthProviderPublic;
        error?: string;
      } | null;
      if (!res.ok || !json?.ok || !json.provider) {
        setProviderError((prev) => ({ ...prev, [provider]: json?.error || `${provider} 설정을 저장하지 못했습니다.` }));
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
      setProviderStatus((prev) => ({ ...prev, [provider]: "저장되었습니다." }));
    } catch {
      setProviderError((prev) => ({ ...prev, [provider]: `${provider} 설정을 저장하지 못했습니다.` }));
    } finally {
      setProviderSaving((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const savePolicy = async (): Promise<void> => {
    if (!sessionPolicy || legacySettings.length === 0) {
      setPolicyError("중복 로그인 정책 저장 준비가 되지 않았습니다.");
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
        setPolicyError(json?.error || "중복 로그인 정책을 저장하지 못했습니다.");
        return;
      }
      setLegacySettings(json.settings);
      setSessionPolicy(json.sessionPolicy);
      setPolicySuccess("저장되었습니다.");
    } catch {
      setPolicyError("중복 로그인 정책을 저장하지 못했습니다.");
    } finally {
      setPolicySaving((prev) => (prev ? false : prev));
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader title="Auth 로그인 설정" />
      <AdminCard title="설정 구분">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveSection("oauth")}
            className={`rounded-ui-rect border px-3 py-2 text-sm font-medium ${
              activeSection === "oauth"
                ? "border-signature bg-signature/10 text-signature"
                : "border-sam-border bg-sam-surface text-sam-fg"
            }`}
          >
            OAuth 설정
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
            중복 로그인 정책
          </button>
        </div>
      </AdminCard>

      {activeSection === "oauth" ? (
        <AdminCard title="SNS OAuth Provider 설정">
        {loading ? (
          <p className="sam-text-body text-sam-muted">불러오는 중…</p>
        ) : (
          <div className="space-y-3">
            {providers.map((row) => (
              <div
                key={row.provider}
                className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="sam-text-body font-semibold text-sam-fg">{getProviderTitle(row.provider)}</p>
                    <p className="sam-text-helper text-sam-muted">{row.provider}</p>
                  </div>
                  <label className="flex items-center gap-2 sam-text-body text-sam-fg">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={(e) => updateProvider(row.provider, { enabled: e.target.checked })}
                    />
                    사용
                  </label>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="sam-text-body text-sam-fg">
                    <span className="mb-1 block sam-text-helper text-sam-muted">정렬 순서</span>
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
                  </label>
                  <label className="sam-text-body text-sam-fg">
                    <span className="mb-1 block sam-text-helper text-sam-muted">Redirect URI</span>
                    <input
                      type="url"
                      value={row.redirect_uri}
                      onChange={(e) => updateProvider(row.provider, { redirect_uri: e.target.value })}
                      className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
                    />
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
                    {providerSaving[row.provider] ? "저장 중…" : `${getProviderTitle(row.provider)} 저장`}
                  </button>
                </div>
              </div>
            ))}
            {error ? <p className="sam-text-body-secondary text-red-600">{error}</p> : null}
          </div>
        )}
      </AdminCard>
      ) : (
      <AdminCard title="중복 로그인 정책">
        {loading || !sessionPolicy ? (
          <p className="sam-text-body text-sam-muted">불러오는 중…</p>
        ) : (
          <div className="space-y-3">
            <p className="sam-text-body-secondary text-sam-muted">
              선택한 조건이 모두 같을 때 기존 세션을 종료하고 새 로그인으로 교체합니다. 기본값은
              `동일 아이디 + 동일 기기 + 동일 브라우저` 입니다.
            </p>
            <label className="flex items-center gap-2 sam-text-body text-sam-fg">
              <input
                type="checkbox"
                checked={sessionPolicy.compare_same_login_id}
                onChange={(e) => updatePolicy({ compare_same_login_id: e.target.checked })}
              />
              동일 아이디 기준 사용
            </label>
            <label className="flex items-center gap-2 sam-text-body text-sam-fg">
              <input
                type="checkbox"
                checked={sessionPolicy.compare_same_device}
                onChange={(e) => updatePolicy({ compare_same_device: e.target.checked })}
                disabled={!sessionPolicy.compare_same_login_id}
              />
              동일 기기일 때만 중복으로 판단
            </label>
            <label className="flex items-center gap-2 sam-text-body text-sam-fg">
              <input
                type="checkbox"
                checked={sessionPolicy.compare_same_browser}
                onChange={(e) => updatePolicy({ compare_same_browser: e.target.checked })}
                disabled={!sessionPolicy.compare_same_login_id}
              />
              동일 브라우저일 때만 중복으로 판단
            </label>
            <label className="flex items-center gap-2 sam-text-body text-sam-fg">
              <input
                type="checkbox"
                checked={sessionPolicy.compare_same_ip}
                onChange={(e) => updatePolicy({ compare_same_ip: e.target.checked })}
                disabled={!sessionPolicy.compare_same_login_id}
              />
              동일 IP일 때만 중복으로 판단
            </label>
            {!sessionPolicy.compare_same_login_id ? (
              <p className="sam-text-body-secondary text-amber-700">
                `동일 아이디 기준 사용`을 끄면 중복 로그인 제한이 사실상 해제됩니다.
              </p>
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
                {policySaving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        )}
      </AdminCard>
      )}
    </div>
  );
}
