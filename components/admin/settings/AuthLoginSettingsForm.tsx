"use client";

import { useEffect, useState } from "react";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { AuthLoginSetting } from "@/lib/auth/login-settings";
import type { AuthDuplicateLoginPolicy } from "@/lib/auth/session-policy";

export function AuthLoginSettingsForm() {
  const [settings, setSettings] = useState<AuthLoginSetting[]>([]);
  const [sessionPolicy, setSessionPolicy] = useState<AuthDuplicateLoginPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/auth-settings", {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          settings?: AuthLoginSetting[];
          sessionPolicy?: AuthDuplicateLoginPolicy;
          error?: string;
        } | null;
        if (!res.ok || !json?.ok || !Array.isArray(json.settings) || !json.sessionPolicy) {
          setError(json?.error || "Auth 설정을 불러오지 못했습니다.");
          return;
        }
        setSettings(json.settings);
        setSessionPolicy(json.sessionPolicy);
      } catch {
        setError("Auth 설정을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updateRow = (provider: string, patch: Partial<AuthLoginSetting>) => {
    setSettings((prev) => prev.map((row) => (row.provider === provider ? { ...row, ...patch } : row)));
  };

  const updatePolicy = (patch: Partial<AuthDuplicateLoginPolicy>) => {
    setSessionPolicy((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const enabledCount = settings.filter((row) => row.enabled).length;

  const save = async () => {
    if (enabledCount === 0) {
      setError("최소 1개의 로그인 방식은 활성화해야 합니다.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/auth-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ settings, sessionPolicy }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        settings?: AuthLoginSetting[];
        sessionPolicy?: AuthDuplicateLoginPolicy;
        error?: string;
      } | null;
      if (!res.ok || !json?.ok || !Array.isArray(json.settings) || !json.sessionPolicy) {
        setError(json?.error || "Auth 설정을 저장하지 못했습니다.");
        return;
      }
      setSettings(json.settings);
      setSessionPolicy(json.sessionPolicy);
    } catch {
      setError("Auth 설정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader title="Auth 로그인 설정" />
      <AdminCard title="로그인 방식 노출 제어">
        {loading ? (
          <p className="sam-text-body text-sam-muted">불러오는 중…</p>
        ) : (
          <div className="space-y-3">
            {settings.map((row) => (
              <div
                key={row.provider}
                className="grid gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4 md:grid-cols-[1.5fr_1fr_120px]"
              >
                <div>
                  <p className="sam-text-body font-semibold text-sam-fg">{row.label}</p>
                  <p className="sam-text-helper text-sam-muted">{row.provider}</p>
                </div>
                <label className="flex items-center gap-2 sam-text-body text-sam-fg">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(e) => updateRow(row.provider, { enabled: e.target.checked })}
                  />
                  사용
                </label>
                <label className="sam-text-body text-sam-fg">
                  <span className="mb-1 block sam-text-helper text-sam-muted">정렬 순서</span>
                  <input
                    type="number"
                    min={1}
                    value={row.sort_order}
                    onChange={(e) => updateRow(row.provider, { sort_order: Number(e.target.value) || 1 })}
                    className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
                  />
                </label>
              </div>
            ))}
            {enabledCount === 0 ? (
              <p className="sam-text-body-secondary text-amber-700">
                모든 로그인 방식을 끄면 사용자 로그인이 불가능해집니다. 최소 1개는 활성화해야 합니다.
              </p>
            ) : null}
            {error ? <p className="sam-text-body-secondary text-red-600">{error}</p> : null}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || enabledCount === 0}
                className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white disabled:opacity-50"
              >
                {saving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        )}
      </AdminCard>
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
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || enabledCount === 0}
                className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white disabled:opacity-50"
              >
                {saving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        )}
      </AdminCard>
    </div>
  );
}
