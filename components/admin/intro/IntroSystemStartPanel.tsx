"use client";

import { useEffect, useState } from "react";
import { Sam } from "@/lib/ui/css-vars";

type SystemStartState = {
  version: number;
  backgroundColor: string;
  matchScene1Appearance: boolean;
  brandMarkEnabled: boolean;
  logoFit?: "CONTAIN" | "COVER" | "ORIGINAL";
  logoSizeNorm?: number;
  logoXNorm?: number;
  logoYNorm?: number;
  note?: string;
};

/**
 * Independent OS System Start editor.
 * Build-bound — never claims Live/Service Apply updates the installed app.
 * Artificial minimum hold is NOT configurable (always 0 in runtime).
 */
export function IntroSystemStartPanel() {
  const [installed, setInstalled] = useState<SystemStartState | null>(null);
  const [draft, setDraft] = useState<SystemStartState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/intro/system-start", { cache: "no-store" });
      const json = (await res.json()) as {
        ok: boolean;
        systemStart?: SystemStartState;
        error?: string;
      };
      if (!json.ok || !json.systemStart) {
        setErr(json.error ?? "load_failed");
        return;
      }
      const next = {
        ...json.systemStart,
        logoFit: json.systemStart.logoFit ?? "CONTAIN",
        logoSizeNorm: json.systemStart.logoSizeNorm ?? 0.28,
        logoXNorm: json.systemStart.logoXNorm ?? 0.5,
        logoYNorm: json.systemStart.logoYNorm ?? 0.42,
      };
      setInstalled(next);
      setDraft(next);
    })();
  }, []);

  if (!draft) {
    return (
      <div className="text-sm text-sam-muted">{err ?? "불러오는 중…"}</div>
    );
  }

  const dirty =
    installed &&
    (draft.backgroundColor !== installed.backgroundColor ||
      draft.logoFit !== installed.logoFit ||
      draft.logoSizeNorm !== installed.logoSizeNorm ||
      draft.logoXNorm !== installed.logoXNorm ||
      draft.logoYNorm !== installed.logoYNorm ||
      draft.brandMarkEnabled !== installed.brandMarkEnabled ||
      draft.matchScene1Appearance !== installed.matchScene1Appearance);

  const needsUpdate =
    installed &&
    draft.backgroundColor.toUpperCase() !== installed.backgroundColor.toUpperCase();

  async function save() {
    const current = draft;
    if (!current) return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/admin/intro/system-start", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backgroundColor: current.backgroundColor,
          matchScene1Appearance: false,
          brandMarkEnabled: current.brandMarkEnabled,
          logoFit: current.logoFit,
          logoSizeNorm: current.logoSizeNorm,
          logoXNorm: current.logoXNorm,
          logoYNorm: current.logoYNorm,
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        systemStart?: SystemStartState;
        message?: string;
        error?: string;
      };
      if (!json.ok || !json.systemStart) {
        setErr(json.error ?? "save_failed");
        return;
      }
      const next = {
        ...json.systemStart,
        logoFit: json.systemStart.logoFit ?? current.logoFit,
        logoSizeNorm: json.systemStart.logoSizeNorm ?? current.logoSizeNorm,
        logoXNorm: json.systemStart.logoXNorm ?? current.logoXNorm,
        logoYNorm: json.systemStart.logoYNorm ?? current.logoYNorm,
      };
      setInstalled(next);
      setDraft(next);
      setMsg(
        json.message ??
          "저장됨. 새 Native 빌드/앱 업데이트 후 기기에 반영됩니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  const logoW = Math.round((draft.logoSizeNorm ?? 0.28) * 100);
  const logoX = Math.round((draft.logoXNorm ?? 0.5) * 100);
  const logoY = Math.round((draft.logoYNorm ?? 0.42) * 100);

  return (
    <div className="space-y-6" data-intro13-system-start="1">
      <div>
        <h2 className="text-lg font-semibold text-sam-fg">시스템 시작 화면</h2>
        <p className="mt-1 text-sm text-sam-muted">
          앱 아이콘 직후 OS가 잠시 보여주는 독립 화면입니다. Product Intro Scene1과
          다릅니다. 표시 시간은 콘텐츠 재생이 아니며, Scene1이 준비되면 즉시 종료합니다
          (임의 최소 유지 시간 없음).
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          <div className="text-xs font-medium text-sam-muted">Preview</div>
          <div
            className="relative mx-auto aspect-[9/16] w-full max-w-[240px] overflow-hidden rounded-ui-rect border border-sam-border"
            style={{ backgroundColor: draft.backgroundColor }}
          >
            {draft.brandMarkEnabled ? (
              <div
                className="absolute rounded-ui-rect bg-white/90"
                style={{
                  left: `${logoX}%`,
                  top: `${logoY}%`,
                  width: `${logoW}%`,
                  height: `${Math.round(logoW * 0.35)}%`,
                  transform: "translate(-50%, -50%)",
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-white/50">
                배경만
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <label className="block text-sm">
            <span className="text-sam-muted">배경색</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={
                  /^#[0-9A-Fa-f]{6}$/.test(draft.backgroundColor)
                    ? draft.backgroundColor
                    : "#312E81"
                }
                onChange={(e) =>
                  setDraft({ ...draft, backgroundColor: e.target.value.toUpperCase() })
                }
                className="h-9 w-12 cursor-pointer rounded-ui-rect border border-sam-border"
              />
              <input
                className={Sam.input.base}
                value={draft.backgroundColor}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    backgroundColor: e.target.value.toUpperCase(),
                  })
                }
                spellCheck={false}
              />
            </div>
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.brandMarkEnabled}
              onChange={(e) =>
                setDraft({ ...draft, brandMarkEnabled: e.target.checked })
              }
            />
            로고 / 마크 표시 (다음 Native 빌드에서 리소스 연결)
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            {(["CONTAIN", "COVER", "ORIGINAL"] as const).map((fit) => (
              <button
                key={fit}
                type="button"
                className={
                  draft.logoFit === fit ? Sam.btn.primary : Sam.btn.secondary
                }
                onClick={() => setDraft({ ...draft, logoFit: fit })}
              >
                {fit === "ORIGINAL" ? "원본 비율" : fit === "COVER" ? "Cover" : "Contain"}
              </button>
            ))}
          </div>

          <label className="block text-sm">
            <span className="text-sam-muted">로고 크기 {logoW}%</span>
            <input
              type="range"
              min={8}
              max={80}
              value={logoW}
              className="mt-1 w-full"
              onChange={(e) =>
                setDraft({
                  ...draft,
                  logoSizeNorm: Number(e.target.value) / 100,
                })
              }
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-sam-muted">가로 위치 {logoX}%</span>
              <input
                type="range"
                min={10}
                max={90}
                value={logoX}
                className="mt-1 w-full"
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    logoXNorm: Number(e.target.value) / 100,
                  })
                }
              />
            </label>
            <label className="block text-sm">
              <span className="text-sam-muted">세로 위치 {logoY}%</span>
              <input
                type="range"
                min={10}
                max={90}
                value={logoY}
                className="mt-1 w-full"
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    logoYNorm: Number(e.target.value) / 100,
                  })
                }
              />
            </label>
          </div>

          <button
            type="button"
            className={Sam.btn.primary}
            disabled={busy || !dirty}
            onClick={() => void save()}
          >
            {busy ? "저장 중…" : "다음 Native 빌드에 저장"}
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-ui-rect border border-sam-border bg-sam-app p-4 text-sm">
          <div className="font-medium text-sam-fg">현재 설치 앱 설정</div>
          <p className="mt-2 text-sam-muted">
            Background{" "}
            <code className="text-sam-fg">{installed?.backgroundColor ?? "—"}</code>
          </p>
          <div
            className="mt-2 h-8 w-full rounded-ui-rect border border-sam-border"
            style={{ backgroundColor: installed?.backgroundColor }}
          />
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-app p-4 text-sm">
          <div className="font-medium text-sam-fg">다음 Native 빌드 설정</div>
          <p className="mt-2 text-sam-muted">
            Background <code className="text-sam-fg">{draft.backgroundColor}</code>
          </p>
          <div
            className="mt-2 h-8 w-full rounded-ui-rect border border-sam-border"
            style={{ backgroundColor: draft.backgroundColor }}
          />
          <p className="mt-3 text-xs font-medium text-sam-fg">
            {needsUpdate || dirty
              ? "앱 업데이트 필요 (서비스 적용으로 바뀌지 않음)"
              : "빌드 입력과 일치"}
          </p>
        </div>
      </div>

      <div className="rounded-ui-rect border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
        Artificial minimum hold = 0. Admin에서 OS 표시 시간(초)을 설정하지 않습니다.
        Samsung/Xiaomi에서 Scene1 렌더 가능 즉시 dismiss 정책을 유지합니다.
      </div>

      {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
      {err ? (
        <p className="text-sm text-red-600" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  );
}
