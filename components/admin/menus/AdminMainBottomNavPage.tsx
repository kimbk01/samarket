"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { BottomNavIconKey } from "@/lib/main-menu/bottom-nav-config";
import {
  MAIN_BOTTOM_NAV_FONT_FAMILY_PRESETS,
  MAIN_BOTTOM_NAV_ICON_ACTIVE_STYLE_PRESETS,
  MAIN_BOTTOM_NAV_ICON_INACTIVE_STYLE_PRESETS,
  MAIN_BOTTOM_NAV_LABEL_ACTIVE_STYLE_PRESETS,
  MAIN_BOTTOM_NAV_LABEL_INACTIVE_STYLE_PRESETS,
  MAIN_BOTTOM_NAV_LABEL_SIZE_PRESETS,
} from "@/lib/main-menu/main-bottom-nav-presets";
import type { MainBottomNavAdminRow } from "@/lib/main-menu/main-bottom-nav-types";
import {
  generateCustomBottomNavTabId,
  isBuiltinBottomNavTabId,
} from "@/lib/main-menu/resolve-main-bottom-nav";
import { notifyMainBottomNavConfigChanged } from "@/lib/app/fetch-main-bottom-nav-deduped";

const ICON_OPTIONS: { value: BottomNavIconKey; label: string }[] = [
  { value: "trade", label: "trade (거래 탭)" },
  { value: "home", label: "home (집)" },
  { value: "community", label: "community (커뮤니티)" },
  { value: "stores", label: "stores (배달)" },
  { value: "chat", label: "chat (거래채팅)" },
  { value: "my", label: "my (내정보)" },
];

const MAX_TABS = 10;

function rowToPayloadItem(row: MainBottomNavAdminRow) {
  return {
    id: row.id,
    visible: row.visible,
    label: row.label.trim() || "메뉴",
    href: row.href,
    icon: row.icon,
    iconSizeClass: row.iconSizeClass,
    labelInactiveExtraClass: row.labelInactiveExtraClass,
    labelActiveExtraClass: row.labelActiveExtraClass,
    iconInactiveClass: row.iconInactiveClass,
    iconActiveClass: row.iconActiveClass,
    labelInactiveClass: row.labelInactiveClass,
    labelActiveClass: row.labelActiveClass,
    labelSizeClass: row.labelSizeClass,
    labelFontFamilyClass: row.labelFontFamilyClass,
  };
}

function presetSelectValue(current: string | undefined, presets: { value: string }[]): string {
  const c = current ?? "";
  if (presets.some((p) => p.value === c)) return c;
  return "__custom__";
}

export function AdminMainBottomNavPage() {
  const [rows, setRows] = useState<MainBottomNavAdminRow[] | null>(null);
  const [fromDb, setFromDb] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/main-bottom-nav", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setMessage({ type: "err", text: data?.error ?? "불러오기 실패" });
        setRows(null);
        return;
      }
      setRows(data.items as MainBottomNavAdminRow[]);
      setFromDb(Boolean(data.from_db));
      setUpdatedAt(typeof data.updated_at === "string" ? data.updated_at : null);
    } catch {
      setMessage({ type: "err", text: "네트워크 오류" });
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const move = (index: number, dir: -1 | 1) => {
    setRows((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  };

  const patchRow = (index: number, patch: Partial<MainBottomNavAdminRow>) => {
    setRows((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const addRow = () => {
    setRows((prev) => {
      if (!prev || prev.length >= MAX_TABS) return prev;
      const id = generateCustomBottomNavTabId();
      const row: MainBottomNavAdminRow = {
        id,
        visible: true,
        label: "새 메뉴",
        href: "/home",
        icon: "home",
      };
      return [...prev, row];
    });
  };

  const removeRow = (index: number) => {
    setRows((prev) => {
      if (!prev || prev.length <= 1) return prev;
      return prev.filter((_, j) => j !== index);
    });
  };

  const save = async () => {
    if (!rows || rows.length === 0) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/main-bottom-nav", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: rows.map(rowToPayloadItem) }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        const err = data?.error as string | undefined;
        const hint =
          err === "items_count"
            ? "탭은 1~10개만 가능합니다."
            : err === "min_one_visible"
              ? "숨김만 있으면 저장할 수 없습니다."
              : err === "invalid_href"
                ? "경로는 / 로 시작하는 내부 링크만 가능합니다."
                : err === "invalid_label"
                  ? "모든 탭에 라벨을 입력하세요."
                  : err;
        setMessage({ type: "err", text: hint ?? err ?? "저장 실패" });
        return;
      }
      setRows(data.items as MainBottomNavAdminRow[]);
      setFromDb(true);
      notifyMainBottomNavConfigChanged();
      setMessage({ type: "ok", text: "저장되었습니다. 앱 하단 탭에 반영됩니다." });
    } catch {
      setMessage({ type: "err", text: "네트워크 오류" });
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!confirm("DB에 저장된 하단 탭 설정을 지우고 코드 기본값으로 돌아갑니다. 계속할까요?")) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/main-bottom-nav", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setMessage({ type: "err", text: data?.error ?? "초기화 실패" });
        return;
      }
      setRows(data.items as MainBottomNavAdminRow[]);
      setFromDb(false);
      setUpdatedAt(null);
      notifyMainBottomNavConfigChanged();
      setMessage({ type: "ok", text: "초기화되었습니다." });
    } catch {
      setMessage({ type: "err", text: "네트워크 오류" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="메인 하단 탭"
        description="탭 추가·삭제(최대 10개), 순서, 숨김(노출 끄기), 라벨·경로·아이콘, 폰트·글자 크기·라벨·아이콘 색 프리셋을 설정합니다."
      />

      <div className="flex flex-wrap items-center gap-2 sam-text-body-secondary text-sam-muted">
        <span>
          저장 위치: <code className="rounded bg-sam-surface-muted px-1">admin_settings.main_bottom_nav</code>
        </span>
        {fromDb ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800">DB 적용 중</span>
        ) : (
          <span className="rounded-full bg-sam-surface-muted px-2 py-0.5 text-sam-fg">코드 기본값</span>
        )}
        {updatedAt ? <span className="text-sam-muted">마지막 수정: {updatedAt}</span> : null}
      </div>

      {message ? (
        <div
          className={`rounded-ui-rect px-4 py-2 sam-text-body ${
            message.type === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving || loading || !rows}
          onClick={() => void save()}
          className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white hover:bg-signature/90 disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
        <button
          type="button"
          disabled={saving || loading || !rows || rows.length >= MAX_TABS}
          onClick={addRow}
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 sam-text-body text-sam-fg hover:bg-sam-app disabled:opacity-50"
        >
          메뉴 추가
        </button>
        <button
          type="button"
          disabled={saving || loading}
          onClick={() => void load()}
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 sam-text-body text-sam-fg hover:bg-sam-app disabled:opacity-50"
        >
          다시 불러오기
        </button>
        <button
          type="button"
          disabled={saving || loading || !fromDb}
          onClick={() => void reset()}
          className="rounded-ui-rect border border-amber-300 bg-amber-50 px-4 py-2 sam-text-body text-amber-900 hover:bg-amber-100 disabled:opacity-50"
        >
          DB 설정 지우기(기본값)
        </button>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 sam-text-body text-sam-fg hover:bg-sam-app"
        >
          {showAdvanced ? "고급(Tailwind 직접) 접기" : "고급(Tailwind 직접) 펼치기"}
        </button>
      </div>

      {loading ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-10 text-center sam-text-body text-sam-muted">불러오는 중…</div>
      ) : !rows ? (
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-4 py-3 sam-text-body text-amber-900">
          목록을 불러오지 못했습니다. 관리자 권한·Supabase 환경을 확인해 주세요.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="min-w-[1100px] w-full border-collapse text-left sam-text-helper">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app text-sam-muted">
                <th className="px-2 py-2 font-medium">순서</th>
                <th className="px-2 py-2 font-medium">노출</th>
                <th className="px-2 py-2 font-medium">삭제</th>
                <th className="px-2 py-2 font-medium">ID</th>
                <th className="px-2 py-2 font-medium">라벨</th>
                <th className="px-2 py-2 font-medium">경로</th>
                <th className="px-2 py-2 font-medium">아이콘</th>
                <th className="px-2 py-2 font-medium">폰트</th>
                <th className="px-2 py-2 font-medium">글자크기</th>
                <th className="px-2 py-2 font-medium">라벨 활성</th>
                <th className="px-2 py-2 font-medium">라벨 비활성</th>
                <th className="px-2 py-2 font-medium">아이콘 활성</th>
                <th className="px-2 py-2 font-medium">아이콘 비활성</th>
                {showAdvanced ? (
                  <>
                    <th className="px-2 py-2 font-medium">글자크기 직접</th>
                    <th className="px-2 py-2 font-medium">라벨 활성+α</th>
                    <th className="px-2 py-2 font-medium">라벨 비활성+α</th>
                    <th className="px-2 py-2 font-medium">아이콘 크기</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.id} className="border-b border-sam-border-soft align-top">
                  <td className="px-2 py-2">
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                        className="rounded border border-sam-border px-1.5 py-0.5 sam-text-xxs disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={i === rows.length - 1}
                        onClick={() => move(i, 1)}
                        className="rounded border border-sam-border px-1.5 py-0.5 sam-text-xxs disabled:opacity-30"
                      >
                        ↓
                      </button>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={row.visible}
                      onChange={(e) => patchRow(i, { visible: e.target.checked })}
                      className="h-4 w-4"
                      title="끄면 앱에서 숨김"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      disabled={rows.length <= 1}
                      onClick={() => removeRow(i)}
                      className="rounded border border-red-200 bg-red-50 px-2 py-0.5 sam-text-xxs text-red-800 disabled:opacity-30"
                      title={rows.length <= 1 ? "최소 1개 탭 필요" : "이 탭 제거"}
                    >
                      삭제
                    </button>
                  </td>
                  <td className="max-w-[100px] truncate px-2 py-2 font-mono sam-text-xxs text-sam-fg" title={row.id}>
                    {row.id}
                    {isBuiltinBottomNavTabId(row.id) ? (
                      <span className="ml-1 sam-text-xxs text-sam-meta">(내장)</span>
                    ) : (
                      <span className="ml-1 sam-text-xxs text-signature">(추가)</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={row.label}
                      onChange={(e) => patchRow(i, { label: e.target.value })}
                      className="w-[88px] max-w-full rounded border border-sam-border px-1.5 py-1 sam-text-helper"
                      maxLength={24}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={row.href}
                      onChange={(e) => patchRow(i, { href: e.target.value })}
                      className="w-[100px] max-w-full rounded border border-sam-border px-1.5 py-1 font-mono sam-text-xxs"
                      maxLength={160}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={row.icon}
                      onChange={(e) => patchRow(i, { icon: e.target.value as BottomNavIconKey })}
                      className="max-w-[120px] rounded border border-sam-border px-1 py-1 sam-text-xxs"
                    >
                      {ICON_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={row.labelFontFamilyClass ?? ""}
                      onChange={(e) => patchRow(i, { labelFontFamilyClass: e.target.value || undefined })}
                      className="max-w-[100px] rounded border border-sam-border px-1 py-1 sam-text-xxs"
                    >
                      {MAIN_BOTTOM_NAV_FONT_FAMILY_PRESETS.map((o) => (
                        <option key={o.label} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={presetSelectValue(row.labelSizeClass, MAIN_BOTTOM_NAV_LABEL_SIZE_PRESETS)}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "__custom__") return;
                        patchRow(i, { labelSizeClass: v || undefined });
                      }}
                      className="max-w-[100px] rounded border border-sam-border px-1 py-1 sam-text-xxs"
                    >
                      {MAIN_BOTTOM_NAV_LABEL_SIZE_PRESETS.map((o) => (
                        <option key={o.label} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                      {row.labelSizeClass && !MAIN_BOTTOM_NAV_LABEL_SIZE_PRESETS.some((p) => p.value === row.labelSizeClass) ? (
                        <option value="__custom__">(고급 입력)</option>
                      ) : null}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={presetSelectValue(row.labelActiveClass, MAIN_BOTTOM_NAV_LABEL_ACTIVE_STYLE_PRESETS)}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "__custom__") return;
                        patchRow(i, { labelActiveClass: v || undefined });
                      }}
                      className="max-w-[120px] rounded border border-sam-border px-1 py-1 sam-text-xxs"
                    >
                      {MAIN_BOTTOM_NAV_LABEL_ACTIVE_STYLE_PRESETS.map((o) => (
                        <option key={o.label} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                      {row.labelActiveClass &&
                      !MAIN_BOTTOM_NAV_LABEL_ACTIVE_STYLE_PRESETS.some((p) => p.value === (row.labelActiveClass ?? "")) ? (
                        <option value="__custom__">(고급 입력)</option>
                      ) : null}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={presetSelectValue(row.labelInactiveClass, MAIN_BOTTOM_NAV_LABEL_INACTIVE_STYLE_PRESETS)}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "__custom__") return;
                        patchRow(i, { labelInactiveClass: v || undefined });
                      }}
                      className="max-w-[120px] rounded border border-sam-border px-1 py-1 sam-text-xxs"
                    >
                      {MAIN_BOTTOM_NAV_LABEL_INACTIVE_STYLE_PRESETS.map((o) => (
                        <option key={o.label} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                      {row.labelInactiveClass &&
                      !MAIN_BOTTOM_NAV_LABEL_INACTIVE_STYLE_PRESETS.some((p) => p.value === (row.labelInactiveClass ?? "")) ? (
                        <option value="__custom__">(고급 입력)</option>
                      ) : null}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={presetSelectValue(row.iconActiveClass, MAIN_BOTTOM_NAV_ICON_ACTIVE_STYLE_PRESETS)}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "__custom__") return;
                        patchRow(i, { iconActiveClass: v || undefined });
                      }}
                      className="max-w-[100px] rounded border border-sam-border px-1 py-1 sam-text-xxs"
                    >
                      {MAIN_BOTTOM_NAV_ICON_ACTIVE_STYLE_PRESETS.map((o) => (
                        <option key={o.label} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                      {row.iconActiveClass &&
                      !MAIN_BOTTOM_NAV_ICON_ACTIVE_STYLE_PRESETS.some((p) => p.value === (row.iconActiveClass ?? "")) ? (
                        <option value="__custom__">(고급)</option>
                      ) : null}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={presetSelectValue(row.iconInactiveClass, MAIN_BOTTOM_NAV_ICON_INACTIVE_STYLE_PRESETS)}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "__custom__") return;
                        patchRow(i, { iconInactiveClass: v || undefined });
                      }}
                      className="max-w-[100px] rounded border border-sam-border px-1 py-1 sam-text-xxs"
                    >
                      {MAIN_BOTTOM_NAV_ICON_INACTIVE_STYLE_PRESETS.map((o) => (
                        <option key={o.label} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                      {row.iconInactiveClass &&
                      !MAIN_BOTTOM_NAV_ICON_INACTIVE_STYLE_PRESETS.some((p) => p.value === (row.iconInactiveClass ?? "")) ? (
                        <option value="__custom__">(고급)</option>
                      ) : null}
                    </select>
                  </td>
                  {showAdvanced ? (
                    <>
                      <td className="px-2 py-2">
                        <input
                          value={row.labelSizeClass ?? ""}
                          onChange={(e) => patchRow(i, { labelSizeClass: e.target.value || undefined })}
                          placeholder="sam-text-xxs"
                          className="w-[100px] rounded border border-sam-border px-1.5 py-1 font-mono sam-text-xxs"
                          maxLength={120}
                          title="프리셋과 병합됨. 비우면 프리셋/기본값"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={row.labelActiveExtraClass ?? ""}
                          onChange={(e) => patchRow(i, { labelActiveExtraClass: e.target.value || undefined })}
                          placeholder="추가 클래스"
                          className="w-[100px] rounded border border-sam-border px-1.5 py-1 font-mono sam-text-xxs"
                          maxLength={120}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={row.labelInactiveExtraClass ?? ""}
                          onChange={(e) => patchRow(i, { labelInactiveExtraClass: e.target.value || undefined })}
                          className="w-[100px] rounded border border-sam-border px-1.5 py-1 font-mono sam-text-xxs"
                          maxLength={120}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={row.iconSizeClass ?? ""}
                          onChange={(e) => patchRow(i, { iconSizeClass: e.target.value || undefined })}
                          placeholder="h-6 w-6"
                          className="w-[90px] rounded border border-sam-border px-1.5 py-1 font-mono sam-text-xxs"
                          maxLength={120}
                        />
                      </td>
                    </>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="sam-text-helper leading-relaxed text-sam-muted">
        추가 탭 id는 <code className="rounded bg-sam-surface-muted px-0.5">custom_*</code> 형식입니다. 경로는 내부 링크만(/로 시작). 최소 1개 탭·1개 이상 노출이어야 저장됩니다. 채팅 읽지 않음 배지는 아이콘이
        &quot;chat&quot;인 탭에만 붙습니다.
      </p>
    </div>
  );
}
