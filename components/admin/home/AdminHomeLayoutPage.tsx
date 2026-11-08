"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { AdminListItemButton } from "@/components/admin/ui/AdminListItemButton";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { formatAdminPhp } from "@/lib/admin/ui-standard/admin-format";
import { HomeBannerPreviewFrame } from "@/components/home-hub/HomeBanner";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import type { MessageKey } from "@/lib/i18n/message-key";
import {
  cloneHomeLayout,
  emptyHomeText,
  HOME_AUDIENCES,
  HOME_BANNER_BODY_MAX,
  HOME_BANNER_IMAGE_MAX_PX,
  HOME_BANNER_IMAGE_MIN_PX,
  HOME_BANNER_IMAGE_PX,
  HOME_BANNER_RATIO_CSS,
  HOME_BANNER_RATIOS,
  HOME_BANNER_SIZE_PERCENT,
  HOME_BANNER_SIZES,
  HOME_BANNER_TITLE_MAX,
  HOME_BANNER_TITLE_SIZES,
  HOME_BANNERS_MAX,
  HOME_MENU_CATALOG,
  HOME_MENU_KEYS,
  HOME_POST_SORTS,
  HOME_POSTS_MAX,
  HOME_POSTS_MIN,
  HOME_SEARCH_PLACEHOLDER_MAX,
  HOME_SECTION_DEFAULT_TITLE_KEYS,
  HOME_SECTION_LABEL_KEYS,
  HOME_SECTION_TITLE_MAX,
  HOME_SECTIONS_MEMBER_ONLY,
  HOME_SERVICE_DESC_MAX,
  HOME_SERVICE_IMAGE_PX,
  HOME_SERVICE_LARGE_MAX,
  HOME_SERVICE_SMALL_MAX,
  HOME_SERVICE_TITLE_MAX,
  HOME_SHORTCUTS_MAX_VISIBLE,
  HOME_STORE_AUTO_FILTERS,
  HOME_STORE_MANUAL_MENUS_MAX,
  HOME_STORE_MENUS_MAX,
  HOME_STORE_MENUS_MIN,
  HOME_STORE_PICKS_MAX,
  HOME_STORE_SHOW_MAX,
  HOME_STORE_SHOW_MIN,
  HOME_TRADES_MAX,
  HOME_TRADES_MIN,
  isSafeHomeHref,
  isSafeHomeImageUrl,
  type HomeAudience,
  type HomeBannerConfig,
  type HomeBannerRatio,
  type HomeBannerSize,
  type HomeBannerTitleSize,
  type HomeLayoutConfig,
  type HomePostSortKey,
  type HomeSectionKey,
  type HomeServiceCardConfig,
  type HomeStoreAutoFilter,
  type HomeStorePick,
  type HomeText,
} from "@/lib/home/home-layout-contract";
import { homeCatalogName, type HomeCatalog } from "@/lib/home/home-catalog-types";
import type { AdminHomeStoreRow } from "@/app/api/admin/home-layout/stores/route";
import type { AdminHomeStoreProductRow } from "@/app/api/admin/home-layout/store-products/route";
import type {
  AdminHomeStorePreviewCity,
  AdminHomeStorePreviewRow,
} from "@/app/api/admin/home-layout/stores-preview/route";
import { storeDisplayStatusLabelKey } from "@/lib/stores/store-display-status-label";

type LoadResponse = {
  ok: boolean;
  source?: "db" | "default";
  config?: HomeLayoutConfig;
  revision?: string | null;
  catalog?: HomeCatalog;
  error?: string;
};

type TabKey = "banners" | "services" | "categories" | "stores" | "trades" | "posts" | "header" | "sections";
const TABS: { key: TabKey; label: MessageKey }[] = [
  { key: "banners", label: "admin_home_layout_tab_banners" },
  { key: "services", label: "admin_home_layout_tab_services" },
  { key: "categories", label: "admin_home_layout_tab_categories" },
  { key: "stores", label: "admin_home_layout_tab_stores" },
  { key: "trades", label: "admin_home_layout_tab_trades" },
  { key: "posts", label: "admin_home_layout_tab_posts" },
  { key: "header", label: "admin_home_layout_tab_header" },
  { key: "sections", label: "admin_home_layout_tab_sections" },
];

const EMPTY_CATALOG: HomeCatalog = { storeCategories: [], tradeCategories: [], communityTopics: [] };
const SIZE_LABEL: Record<HomeBannerSize, MessageKey> = {
  s: "admin_home_layout_size_s",
  m: "admin_home_layout_size_m",
  l: "admin_home_layout_size_l",
};
const TITLE_SIZE_LABEL: Record<HomeBannerTitleSize, MessageKey> = {
  s: "admin_home_layout_size_small",
  m: "admin_home_layout_size_normal",
  l: "admin_home_layout_size_large",
};
const AUDIENCE_LABEL: Record<HomeAudience, MessageKey> = {
  all: "admin_home_layout_audience_all",
  member: "admin_home_layout_audience_member",
  guest: "admin_home_layout_audience_guest",
};
const FILTER_LABEL: Record<HomeStoreAutoFilter, MessageKey> = {
  all: "admin_home_layout_filter_all",
  recent_orders: "admin_home_layout_filter_recent",
  newest: "admin_home_layout_filter_newest",
};
const POST_SORT_LABEL: Record<HomePostSortKey, MessageKey> = {
  latest: "admin_home_layout_sort_latest",
  popular: "admin_home_layout_sort_popular",
  recommended: "admin_home_layout_sort_recommended",
};

function move<T>(list: readonly T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return [...list];
  const next = list.slice();
  const tmp = next[i]!;
  next[i] = next[j]!;
  next[j] = tmp;
  return next;
}

function range(min: number, max: number): number[] {
  const out: number[] = [];
  for (let n = min; n <= max; n++) out.push(n);
  return out;
}

const INPUT_CLS =
  "w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg focus:border-sam-primary focus:outline-none";
const BOX_CLS = "rounded-ui-rect border border-sam-border bg-sam-surface p-4";

type Tr = ReturnType<typeof useI18n>["t"];
type SetDraft = (fn: (d: HomeLayoutConfig) => HomeLayoutConfig) => void;

/* ───────────── 작은 부품 ───────────── */

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-3 first:mt-0">
      <div className="mb-1 sam-text-body font-semibold text-sam-fg">{label}</div>
      {children}
      {hint ? <div className="mt-1 sam-text-helper text-sam-muted">{hint}</div> : null}
    </div>
  );
}

function Seg<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <AdminChipButton
            key={String(o.value)}
            role="radio"
            aria-checked={on}
            selected={on}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </AdminChipButton>
        );
      })}
    </div>
  );
}

function Check({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className={`inline-flex items-center gap-1.5 sam-text-body ${disabled ? "text-sam-muted opacity-60" : "text-sam-fg"}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function TextPair({
  value,
  max,
  onChange,
  tr,
  placeholderKo,
}: {
  value: HomeText;
  max: number;
  onChange: (v: HomeText) => void;
  tr: Tr;
  placeholderKo?: string;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {(["ko", "en"] as const).map((lang) => (
        <label key={lang} className="block">
          <span className="mb-0.5 flex justify-between sam-text-helper text-sam-muted">
            <span>{tr(lang === "ko" ? "admin_home_layout_korean" : "admin_home_layout_english")}</span>
            <span className="tabular-nums">
              {value[lang].length}/{max}
            </span>
          </span>
          <input
            className={INPUT_CLS}
            value={value[lang]}
            maxLength={max}
            placeholder={lang === "ko" ? placeholderKo : undefined}
            onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
          />
        </label>
      ))}
    </div>
  );
}

function Arrows({ tr, i, n, onMove }: { tr: Tr; i: number; n: number; onMove: (dir: -1 | 1) => void }) {
  return (
    <span className="flex shrink-0 gap-1">
      <AdminActionButton size="sm" disabled={i === 0} onClick={() => onMove(-1)} aria-label={tr("admin_home_layout_up")}>
        ↑
      </AdminActionButton>
      <AdminActionButton size="sm" disabled={i === n - 1} onClick={() => onMove(1)} aria-label={tr("admin_home_layout_down")}>
        ↓
      </AdminActionButton>
    </span>
  );
}

function Thumb({ src, size = 44, round = false }: { src: string | null; size?: number; round?: boolean }) {
  const shape = round ? "rounded-full" : "rounded-ui-rect";
  if (!src) return <span className={`inline-block shrink-0 bg-sam-surface-muted ${shape}`} style={{ width: size, height: size }} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- admin preview thumbnail
    <img src={src} alt="" width={size} height={size} className={`shrink-0 object-cover ${shape}`} style={{ width: size, height: size }} />
  );
}

/** 이미지 올리기 — 서버가 비율·크기를 검사한다 */
function ImageUpload({
  tr,
  kind,
  ratio,
  value,
  onChange,
  allowClear,
}: {
  tr: Tr;
  kind: "banner" | "service";
  ratio: HomeBannerRatio;
  value: string;
  onChange: (url: string) => void;
  allowClear?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const spec = kind === "banner" ? HOME_BANNER_IMAGE_PX[ratio] : HOME_SERVICE_IMAGE_PX;
  const specText =
    kind === "banner"
      ? tr("admin_home_layout_image_spec_banner", { ratio, w: spec.w, h: spec.h, minW: spec.minW, minH: spec.minH })
      : tr("admin_home_layout_image_spec_service", { w: spec.w, h: spec.h, minW: spec.minW, minH: spec.minH });

  const upload = async (file: File) => {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("ratio", kind === "banner" ? ratio : "1:1");
      fd.set("file", file);
      const res = await fetch("/api/admin/home-layout/upload", { method: "POST", body: fd, credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        url?: string;
        error?: string;
        width?: number;
        height?: number;
        minWidth?: number;
        minHeight?: number;
      };
      if (!res.ok || !data.ok || !data.url) {
        const code = data.error ?? `http_${res.status}`;
        if (code === "ratio_mismatch") {
          setErr(tr("admin_home_layout_upload_err_ratio", { width: data.width ?? 0, height: data.height ?? 0 }));
        } else if (code === "image_too_small") {
          setErr(
            tr("admin_home_layout_upload_err_small", {
              width: data.width ?? 0,
              height: data.height ?? 0,
              minW: data.minWidth ?? spec.minW,
              minH: data.minHeight ?? spec.minH,
            })
          );
        } else if (code === "invalid_type") setErr(tr("admin_home_layout_upload_err_type"));
        else if (code === "file_too_large") setErr(tr("admin_home_layout_upload_err_size"));
        else setErr(tr("admin_home_layout_upload_err_other", { reason: code }));
        return;
      }
      onChange(data.url);
    } catch (e) {
      setErr(tr("admin_home_layout_upload_err_other", { reason: e instanceof Error ? e.message : "" }));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="rounded-ui-rect border border-dashed border-sam-border p-3">
      <div className="flex items-center gap-3">
        <span
          className="grid shrink-0 place-items-center overflow-hidden rounded-ui-rect bg-sam-surface-muted"
          style={{ width: 72, aspectRatio: kind === "banner" ? HOME_BANNER_RATIO_CSS[ratio] : "1 / 1" }}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element -- admin preview
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : null}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <AdminActionButton size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy
                ? tr("admin_home_layout_image_uploading")
                : value
                  ? tr("admin_home_layout_image_replace")
                  : tr("admin_home_layout_image_upload")}
            </AdminActionButton>
            {allowClear && value ? (
              <AdminActionButton size="sm" disabled={busy} onClick={() => onChange("")}>
                {tr("admin_home_layout_image_clear")}
              </AdminActionButton>
            ) : null}
          </div>
          <p className="mt-1 sam-text-helper text-sam-muted">{specText}</p>
        </div>
      </div>
      {err ? <p className="mt-2 sam-text-helper text-sam-danger">{err}</p> : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/webp,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
    </div>
  );
}

/** 앱 홈 배너와 같은 모양의 미리보기 (배경·카드 없음) */
function BannerPreview({ banner, language, tr }: { banner: HomeBannerConfig; language: string; tr: Tr }) {
  const [width, setWidth] = useState<375 | 760>(375);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="sam-text-body font-semibold">{tr("admin_home_layout_preview")}</span>
        <Seg
          value={width}
          onChange={setWidth}
          options={[
            { value: 375, label: tr("admin_home_layout_preview_phone") },
            { value: 760, label: tr("admin_home_layout_preview_tablet") },
          ]}
        />
      </div>
      <div className="overflow-x-auto rounded-ui-rect bg-sam-surface-muted p-3">
        <HomeBannerPreviewFrame banner={banner} language={language} adLabel={tr("home_ad")} width={width} />
      </div>
      <p className="mt-1 sam-text-helper text-sam-muted">
        {tr("admin_home_layout_preview_note", { min: HOME_BANNER_IMAGE_MIN_PX, max: HOME_BANNER_IMAGE_MAX_PX })}
      </p>
    </div>
  );
}

/**
 * 누르면 이동 — 메뉴 목록 또는 앱 안 주소.
 * 직접 입력은 친 그대로 저장 값에 들어가고, 잘못된 주소면 저장 전 검사에서 막는다 (감사 E12 — 예전 값 남기기·「/」 자동 대입 없음).
 */
function HrefPicker({ value, onChange, tr }: { value: string; onChange: (v: string) => void; tr: Tr }) {
  const matched = HOME_MENU_KEYS.find((k) => HOME_MENU_CATALOG[k].href === value);
  const [customMode, setCustomMode] = useState(() => Boolean(value) && !matched);
  const mode = customMode ? "custom" : !value ? "none" : (matched ?? "custom");
  const invalid = mode === "custom" && Boolean(value.trim()) && !isSafeHomeHref(value);
  return (
    <div className="space-y-2">
      <select
        className={INPUT_CLS}
        value={mode}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "none") {
            setCustomMode(false);
            onChange("");
          } else if (v === "custom") {
            setCustomMode(true);
            onChange("");
          } else {
            setCustomMode(false);
            onChange(HOME_MENU_CATALOG[v as (typeof HOME_MENU_KEYS)[number]].href);
          }
        }}
      >
        <option value="none">{tr("admin_home_layout_href_none")}</option>
        {HOME_MENU_KEYS.map((k) => (
          <option key={k} value={k}>
            {tr(HOME_MENU_CATALOG[k].labelKey)} ({HOME_MENU_CATALOG[k].href})
          </option>
        ))}
        <option value="custom">{tr("admin_home_layout_href_custom")}</option>
      </select>
      {mode === "custom" ? (
        <input
          className={INPUT_CLS}
          value={value}
          placeholder={tr("admin_home_layout_href_custom_ph")}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : null}
      {invalid ? <p className="sam-text-helper text-sam-danger">{tr("admin_home_layout_href_invalid")}</p> : null}
    </div>
  );
}

/* ───────────── 칸 제목 (제목 줄이 있는 칸) ───────────── */

function SectionTitleField({
  draft,
  sectionKey,
  setDraft,
  tr,
}: {
  draft: HomeLayoutConfig;
  sectionKey: HomeSectionKey;
  setDraft: SetDraft;
  tr: Tr;
}) {
  const s = draft.sections.find((x) => x.key === sectionKey);
  const defKey = HOME_SECTION_DEFAULT_TITLE_KEYS[sectionKey];
  if (!s) return null;
  return (
    <Field
      label={tr("admin_home_layout_section_title")}
      hint={defKey ? tr("admin_home_layout_section_title_hint", { name: tr(defKey) }) : undefined}
    >
      <TextPair
        tr={tr}
        value={s.title}
        max={HOME_SECTION_TITLE_MAX}
        placeholderKo={defKey ? tr(defKey) : undefined}
        onChange={(v) =>
          setDraft((d) => ({ ...d, sections: d.sections.map((x) => (x.key === sectionKey ? { ...x, title: v } : x)) }))
        }
      />
    </Field>
  );
}

/* ───────────── 탭: 상단 배너 ───────────── */

function newBannerId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `b-${Date.now().toString(36)}`;
}

function BannersTab({
  draft,
  setDraft,
  tr,
  language,
  focus,
}: {
  draft: HomeLayoutConfig;
  setDraft: SetDraft;
  tr: Tr;
  language: string;
  /** 저장 검사에서 걸린 배너 — 그 배너를 골라 보여 준다 (감사 E9) */
  focus: { id: string; nonce: number } | null;
}) {
  const [selId, setSelId] = useState<string | null>(draft.banners[0]?.id ?? null);
  useEffect(() => {
    if (focus) setSelId(focus.id);
  }, [focus]);
  const sel = draft.banners.find((b) => b.id === selId) ?? null;
  const patch = (id: string, p: Partial<HomeBannerConfig>) =>
    setDraft((d) => ({ ...d, banners: d.banners.map((b) => (b.id === id ? { ...b, ...p } : b)) }));

  const add = () => {
    const id = newBannerId();
    const nb: HomeBannerConfig = {
      id,
      imageUrl: "",
      ratio: "1:1",
      size: "m",
      side: "left",
      titleSize: "m",
      title: emptyHomeText(),
      body: emptyHomeText(),
      href: "",
      audience: "all",
      visible: true,
      adLabel: false,
    };
    setDraft((d) => ({ ...d, banners: [...d.banners, nb] }));
    setSelId(id);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className={BOX_CLS}>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <b className="sam-text-section-title">{tr("admin_home_layout_banner_list")}</b>
          <span className="sam-text-helper text-sam-muted">{tr("admin_home_layout_banner_list_hint", { max: HOME_BANNERS_MAX })}</span>
        </div>
        {draft.banners.length === 0 ? <p className="sam-text-body text-sam-muted">{tr("admin_home_layout_banner_empty")}</p> : null}
        {draft.banners.map((b, i) => {
          const on = b.id === selId;
          return (
            <div
              key={b.id}
              className={`flex items-center gap-3 border-t border-sam-border py-2 first:border-t-0 ${on ? "-mx-4 bg-sam-primary-soft px-4" : ""}`}
            >
              <AdminListItemButton
                selected={b.id === selId}
                className="flex min-w-0 flex-1 items-center gap-3"
                onClick={() => setSelId(b.id)}
              >
                <Thumb src={b.imageUrl || null} />
                <span className="min-w-0">
                  <span className="block truncate sam-text-body font-semibold">{b.title.ko || tr("admin_home_layout_banner_untitled")}</span>
                  <span className="block truncate sam-text-helper text-sam-muted">
                    {b.ratio} · {tr(SIZE_LABEL[b.size], { pct: HOME_BANNER_SIZE_PERCENT[b.size] })} ·{" "}
                    {tr(b.side === "left" ? "admin_home_layout_side_left" : "admin_home_layout_side_right")} ·{" "}
                    {tr(AUDIENCE_LABEL[b.audience])}
                  </span>
                </span>
              </AdminListItemButton>
              <Check checked={b.visible} onChange={(v) => patch(b.id, { visible: v })} label={tr("admin_home_layout_visible")} />
              <Arrows
                tr={tr}
                i={i}
                n={draft.banners.length}
                onMove={(dir) => setDraft((d) => ({ ...d, banners: move(d.banners, i, dir) }))}
              />
            </div>
          );
        })}
        <div className="mt-3">
          <AdminActionButton size="sm" disabled={draft.banners.length >= HOME_BANNERS_MAX} onClick={add}>
            {tr("admin_home_layout_banner_add")}
          </AdminActionButton>
        </div>
      </div>

      {sel ? (
        <div className={BOX_CLS}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <b className="sam-text-section-title">{tr("admin_home_layout_banner_edit")}</b>
            <AdminActionButton
              size="sm"
              onClick={() => {
                setDraft((d) => ({ ...d, banners: d.banners.filter((b) => b.id !== sel.id) }));
                setSelId(null);
              }}
            >
              {tr("admin_home_layout_banner_delete")}
            </AdminActionButton>
          </div>
          <Field label={tr("admin_home_layout_ratio")}>
            <Seg value={sel.ratio} onChange={(v) => patch(sel.id, { ratio: v })} options={HOME_BANNER_RATIOS.map((r) => ({ value: r, label: r }))} />
          </Field>
          <Field label={tr("admin_home_layout_size")}>
            <Seg
              value={sel.size}
              onChange={(v) => patch(sel.id, { size: v })}
              options={HOME_BANNER_SIZES.map((s) => ({ value: s, label: tr(SIZE_LABEL[s], { pct: HOME_BANNER_SIZE_PERCENT[s] }) }))}
            />
          </Field>
          <Field label={tr("admin_home_layout_side")}>
            <Seg
              value={sel.side}
              onChange={(v) => patch(sel.id, { side: v })}
              options={[
                { value: "left", label: tr("admin_home_layout_side_left") },
                { value: "right", label: tr("admin_home_layout_side_right") },
              ]}
            />
          </Field>
          <Field label={tr("admin_home_layout_image")}>
            <ImageUpload tr={tr} kind="banner" ratio={sel.ratio} value={sel.imageUrl} onChange={(url) => patch(sel.id, { imageUrl: url })} />
          </Field>
          <Field label={tr("admin_home_layout_title")}>
            <TextPair tr={tr} value={sel.title} max={HOME_BANNER_TITLE_MAX} onChange={(v) => patch(sel.id, { title: v })} />
          </Field>
          <Field label={tr("admin_home_layout_title_size")}>
            <Seg
              value={sel.titleSize}
              onChange={(v) => patch(sel.id, { titleSize: v })}
              options={HOME_BANNER_TITLE_SIZES.map((s) => ({ value: s, label: tr(TITLE_SIZE_LABEL[s]) }))}
            />
          </Field>
          <Field label={tr("admin_home_layout_body")}>
            <TextPair tr={tr} value={sel.body} max={HOME_BANNER_BODY_MAX} onChange={(v) => patch(sel.id, { body: v })} />
          </Field>
          <Field label={tr("admin_home_layout_href")} hint={tr("admin_home_layout_href_guest_hint")}>
            <HrefPicker key={sel.id} value={sel.href} onChange={(v) => patch(sel.id, { href: v })} tr={tr} />
          </Field>
          <Field label={tr("admin_home_layout_audience")}>
            <Seg
              value={sel.audience}
              onChange={(v) => patch(sel.id, { audience: v })}
              options={HOME_AUDIENCES.map((a) => ({ value: a, label: tr(AUDIENCE_LABEL[a]) }))}
            />
          </Field>
          <Field label={tr("admin_home_layout_display")}>
            <div className="flex flex-wrap gap-4">
              <Check checked={sel.visible} onChange={(v) => patch(sel.id, { visible: v })} label={tr("admin_home_layout_visible")} />
              <Check checked={sel.adLabel} onChange={(v) => patch(sel.id, { adLabel: v })} label={tr("admin_home_layout_ad_label")} />
            </div>
          </Field>
          <div className="pt-4">
            <BannerPreview banner={sel} language={language} tr={tr} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ───────────── 탭: 서비스 카드 ───────────── */

function ServicesTab({ draft, setDraft, tr }: { draft: HomeLayoutConfig; setDraft: SetDraft; tr: Tr }) {
  const visible = draft.services.filter((s) => s.visible);
  const nLarge = visible.filter((s) => s.size === "large").length;
  const nSmall = visible.filter((s) => s.size === "small").length;
  const patch = (key: HomeServiceCardConfig["key"], p: Partial<HomeServiceCardConfig>) =>
    setDraft((d) => ({ ...d, services: d.services.map((s) => (s.key === key ? { ...s, ...p } : s)) }));
  const full = (size: "large" | "small") => (size === "large" ? nLarge >= HOME_SERVICE_LARGE_MAX : nSmall >= HOME_SERVICE_SMALL_MAX);
  const autoHint = (key: HomeServiceCardConfig["key"]) => {
    if (key === "trade") return tr("admin_home_layout_desc_auto_hint_trade");
    if (key === "stores") return tr("admin_home_layout_desc_auto_hint_stores");
    return tr("admin_home_layout_desc_auto_hint_other", { text: tr(HOME_MENU_CATALOG[key].descKey) });
  };

  return (
    <div className="space-y-3">
      <p className="sam-text-body text-sam-muted">
        {tr("admin_home_layout_services_hint", { large: HOME_SERVICE_LARGE_MAX, small: HOME_SERVICE_SMALL_MAX })}
      </p>
      {draft.services.map((s, i) => (
        <div key={s.key} className={BOX_CLS}>
          <div className="flex flex-wrap items-center gap-3">
            <b className="min-w-[90px] sam-text-section-title">{tr(HOME_MENU_CATALOG[s.key].labelKey)}</b>
            <Check
              checked={s.visible}
              disabled={!s.visible && full(s.size)}
              onChange={(v) => patch(s.key, { visible: v })}
              label={tr("admin_home_layout_visible")}
            />
            <Seg
              value={s.size}
              onChange={(v) => patch(s.key, { size: v })}
              options={[
                {
                  value: "large",
                  label: tr("admin_home_layout_card_large"),
                  disabled: s.visible && s.size !== "large" && full("large"),
                },
                {
                  value: "small",
                  label: tr("admin_home_layout_card_small"),
                  disabled: s.visible && s.size !== "small" && full("small"),
                },
              ]}
            />
            <span className="ml-auto">
              <Arrows
                tr={tr}
                i={i}
                n={draft.services.length}
                onMove={(dir) => setDraft((d) => ({ ...d, services: move(d.services, i, dir) }))}
              />
            </span>
          </div>
          {!s.visible && full(s.size) ? <p className="mt-1 sam-text-helper text-sam-warning">{tr("admin_home_layout_limit_reached")}</p> : null}
          {s.visible ? (
            <div className="mt-2 grid gap-3 lg:grid-cols-2">
              <div>
                <Field label={tr("admin_home_layout_title")} hint={tr("admin_home_layout_card_title_hint")}>
                  <TextPair
                    tr={tr}
                    value={s.title}
                    max={HOME_SERVICE_TITLE_MAX}
                    placeholderKo={tr(HOME_MENU_CATALOG[s.key].labelKey)}
                    onChange={(v) => patch(s.key, { title: v })}
                  />
                </Field>
                <Field label={tr("admin_home_layout_card_desc")} hint={s.descMode === "auto" ? autoHint(s.key) : undefined}>
                  <Seg
                    value={s.descMode}
                    onChange={(v) => patch(s.key, { descMode: v })}
                    options={[
                      { value: "auto", label: tr("admin_home_layout_desc_auto") },
                      { value: "custom", label: tr("admin_home_layout_desc_custom") },
                    ]}
                  />
                  {s.descMode === "custom" ? (
                    <div className="mt-2">
                      <TextPair tr={tr} value={s.desc} max={HOME_SERVICE_DESC_MAX} onChange={(v) => patch(s.key, { desc: v })} />
                    </div>
                  ) : null}
                </Field>
                {s.key === "chat" ? (
                  <Field label={tr("admin_home_layout_display")}>
                    <Check checked={s.showBadge} onChange={(v) => patch(s.key, { showBadge: v })} label={tr("admin_home_layout_show_badge")} />
                  </Field>
                ) : null}
              </div>
              {s.size === "large" ? (
                <Field label={tr("admin_home_layout_image")} hint={tr("admin_home_layout_card_image_auto")}>
                  <ImageUpload tr={tr} kind="service" ratio="1:1" value={s.imageUrl} allowClear onChange={(url) => patch(s.key, { imageUrl: url })} />
                </Field>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
      <ShortcutsBox draft={draft} setDraft={setDraft} tr={tr} />
    </div>
  );
}

function ShortcutsBox({ draft, setDraft, tr }: { draft: HomeLayoutConfig; setDraft: SetDraft; tr: Tr }) {
  const n = draft.shortcuts.filter((s) => s.visible).length;
  return (
    <div className={BOX_CLS}>
      <b className="sam-text-section-title">{tr("admin_home_layout_shortcuts", { max: HOME_SHORTCUTS_MAX_VISIBLE })}</b>
      <p className="mt-1 sam-text-helper text-sam-muted">{tr("admin_home_layout_shortcuts_hint")}</p>
      {draft.shortcuts.map((s, i) => (
        <div key={s.key} className="flex flex-wrap items-center gap-3 border-t border-sam-border py-2 first:border-t-0">
          <span className="min-w-[110px] sam-text-body">{tr(HOME_MENU_CATALOG[s.key].labelKey)}</span>
          <Check
            checked={s.visible}
            disabled={!s.visible && n >= HOME_SHORTCUTS_MAX_VISIBLE}
            onChange={(v) => setDraft((d) => ({ ...d, shortcuts: d.shortcuts.map((x) => (x.key === s.key ? { ...x, visible: v } : x)) }))}
            label={tr("admin_home_layout_visible")}
          />
          <span className="ml-auto">
            <Arrows
              tr={tr}
              i={i}
              n={draft.shortcuts.length}
              onMove={(dir) => setDraft((d) => ({ ...d, shortcuts: move(d.shortcuts, i, dir) }))}
            />
          </span>
        </div>
      ))}
    </div>
  );
}

/* ───────────── 탭: 배달 업종 줄 ───────────── */

function CategoriesTab({
  draft,
  setDraft,
  tr,
  language,
  catalog,
}: {
  draft: HomeLayoutConfig;
  setDraft: SetDraft;
  tr: Tr;
  language: string;
  catalog: HomeCatalog;
}) {
  const slugs = draft.categories.slugs;
  const bySlug = new Map(catalog.storeCategories.map((c) => [c.slug, c] as const));
  const setSlugs = (next: string[]) => setDraft((d) => ({ ...d, categories: { ...d.categories, slugs: next } }));
  const rest = catalog.storeCategories.filter((c) => !slugs.includes(c.slug));
  return (
    <div className="space-y-3">
      <div className={BOX_CLS}>
        <SectionTitleField draft={draft} sectionKey="categories" setDraft={setDraft} tr={tr} />
        <Field label={tr("admin_home_layout_categories_layout")}>
          <Seg
            value={draft.categories.layout}
            onChange={(v) => setDraft((d) => ({ ...d, categories: { ...d.categories, layout: v } }))}
            options={[
              { value: "row", label: tr("admin_home_layout_layout_row") },
              { value: "grid", label: tr("admin_home_layout_layout_grid") },
            ]}
          />
        </Field>
      </div>
      <div className={BOX_CLS}>
        <b className="sam-text-section-title">{tr("admin_home_layout_categories_pick")}</b>
        <p className="mt-1 sam-text-helper text-sam-muted">{tr("admin_home_layout_categories_all_hint")}</p>
        <p className="sam-text-helper text-sam-muted">{tr("admin_home_layout_categories_image_hint")}</p>
        {slugs.map((slug, i) => {
          const c = bySlug.get(slug);
          return (
            <div key={slug} className="flex items-center gap-3 border-t border-sam-border py-2 first:border-t-0">
              <Thumb src={c?.imageUrl ?? null} size={40} round />
              <span className="min-w-0 flex-1 truncate sam-text-body">{c ? homeCatalogName(c, language) : slug}</span>
              <Arrows tr={tr} i={i} n={slugs.length} onMove={(dir) => setSlugs(move(slugs, i, dir))} />
              <AdminActionButton size="sm" onClick={() => setSlugs(slugs.filter((s) => s !== slug))}>
                {tr("admin_home_layout_remove")}
              </AdminActionButton>
            </div>
          );
        })}
        {rest.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {rest.map((c) => (
              <AdminChipButton key={c.slug} onClick={() => setSlugs([...slugs, c.slug])}>
                <Thumb src={c.imageUrl} size={24} round />
                {homeCatalogName(c, language)} +
              </AdminChipButton>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ───────────── 탭: 추천 매장·메뉴 ───────────── */

function storeNotShownReasons(s: AdminHomeStoreRow, tr: Tr): string[] {
  const r: string[] = [];
  if (!s.approved) r.push(tr("admin_home_layout_reason_not_approved"));
  if (!s.visible) r.push(tr("admin_home_layout_reason_hidden"));
  if (!s.deliveryAvailable) r.push(tr("admin_home_layout_reason_no_delivery"));
  // 영업시간 밖·영업 꺼짐은 이유가 아니다 — 홈은 배달 지역 안이면 보여 준다 (Owner 2026-11-09)
  if (s.activeMenuCount === 0) r.push(tr("admin_home_layout_reason_no_menu"));
  return r;
}

function StoreChips({ s, tr }: { s: AdminHomeStoreRow; tr: Tr }) {
  const chip = (on: boolean, label: string) => (
    <span className={`rounded-ui-rect px-1.5 py-0.5 sam-text-helper ${on ? "bg-sam-success-soft text-sam-success" : "bg-sam-danger-soft text-sam-danger"}`}>
      {label}
    </span>
  );
  return (
    <span className="flex flex-wrap gap-1">
      {chip(s.approved, tr("admin_home_layout_chip_approved"))}
      {chip(s.visible, tr("admin_home_layout_chip_visible"))}
      {chip(s.deliveryAvailable, tr("admin_home_layout_chip_delivery"))}
      <span
        className={`rounded-ui-rect px-1.5 py-0.5 sam-text-helper ${s.isOpen ? "bg-sam-success-soft text-sam-success" : "bg-sam-surface-muted text-sam-muted"}`}
      >
        {s.isOpen ? tr("admin_home_layout_chip_open") : tr("admin_home_layout_chip_closed")}
      </span>
      {s.isSample ? (
        <span className="rounded-ui-rect bg-sam-warning-soft px-1.5 py-0.5 sam-text-helper text-sam-warning">{tr("admin_home_layout_chip_sample")}</span>
      ) : null}
      {chip(s.activeMenuCount > 0, tr("admin_home_layout_chip_menus", { count: s.activeMenuCount }))}
    </span>
  );
}

function PickMenus({ pick, onChange, tr }: { pick: HomeStorePick; onChange: (p: HomeStorePick) => void; tr: Tr }) {
  const [products, setProducts] = useState<AdminHomeStoreProductRow[] | null>(null);
  useEffect(() => {
    if (pick.menuMode !== "manual") return;
    let alive = true;
    void fetch(`/api/admin/home-layout/store-products?storeId=${encodeURIComponent(pick.storeId)}`, {
      cache: "no-store",
      credentials: "include",
    })
      .then((r) => r.json())
      .then((d: { ok?: boolean; products?: AdminHomeStoreProductRow[] }) => {
        if (alive) setProducts(d.ok ? (d.products ?? []) : []);
      })
      .catch(() => {
        if (alive) setProducts([]);
      });
    return () => {
      alive = false;
    };
  }, [pick.menuMode, pick.storeId]);

  return (
    <div className="mt-2">
      <Field label={tr("admin_home_layout_menu_mode")}>
        <Seg
          value={pick.menuMode}
          onChange={(v) => onChange({ ...pick, menuMode: v })}
          options={[
            { value: "auto", label: tr("admin_home_layout_menu_auto") },
            { value: "manual", label: tr("admin_home_layout_menu_manual") },
          ]}
        />
      </Field>
      {pick.menuMode === "manual" ? (
        <div className="mt-2">
          <p className="sam-text-helper text-sam-muted">{tr("admin_home_layout_menu_pick_hint", { max: HOME_STORE_MANUAL_MENUS_MAX })}</p>
          {products == null ? <p className="sam-text-helper text-sam-muted">{tr("admin_home_layout_loading")}</p> : null}
          <div className="mt-1 grid gap-1 sm:grid-cols-2">
            {(products ?? []).map((p) => {
              const idx = pick.productIds.indexOf(p.id);
              const on = idx >= 0;
              const full = !on && pick.productIds.length >= HOME_STORE_MANUAL_MENUS_MAX;
              return (
                <label
                  key={p.id}
                  className={`flex items-center gap-2 rounded-ui-rect border border-sam-border p-1.5 ${p.hiddenReason || full ? "opacity-50" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!on && (Boolean(p.hiddenReason) || full)}
                    onChange={(e) =>
                      onChange({
                        ...pick,
                        productIds: e.target.checked ? [...pick.productIds, p.id] : pick.productIds.filter((x) => x !== p.id),
                      })
                    }
                  />
                  <Thumb src={p.thumbnailUrl} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate sam-text-body">{p.title}</span>
                    <span className="block sam-text-helper text-sam-muted">
                      {formatAdminPhp(p.price)}
                      {p.hiddenReason === "no_photo" ? ` · ${tr("admin_home_layout_menu_no_photo")}` : ""}
                      {p.hiddenReason === "review_or_section" ? ` · ${tr("admin_home_layout_menu_hidden")}` : ""}
                    </span>
                  </span>
                  {on ? <span className="sam-text-helper font-bold text-sam-primary">{idx + 1}</span> : null}
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * 주소별 미리보기 (계획 7번 · Owner 「계획대로 수정」 2026-11-09) — 도시를 고르면 그 도시를 대표 배달 주소로 둔 회원에게
 * 홈 「배달 매장」 칸에 나올 매장을 지금 고친 설정(저장 전 포함)으로 보여 준다. 배달 지역 판정은 서버가 배달 탭과 같은 판정으로 한다.
 */
function StoresPreviewBox({ st, tr }: { st: HomeLayoutConfig["stores"]; tr: Tr }) {
  const [cities, setCities] = useState<AdminHomeStorePreviewCity[]>([]);
  const [cityQ, setCityQ] = useState("");
  const [lguId, setLguId] = useState("");
  const [rows, setRows] = useState<AdminHomeStorePreviewRow[] | null>(null);
  const [outOfArea, setOutOfArea] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const loadCities = useCallback(async (q: string) => {
    try {
      const r = await fetch(`/api/admin/home-layout/stores-preview${q ? `?q=${encodeURIComponent(q)}` : ""}`, {
        cache: "no-store",
        credentials: "include",
      });
      const d = (await r.json()) as { ok?: boolean; cities?: AdminHomeStorePreviewCity[] };
      if (d.ok) {
        setCities((prev) => {
          const m = new Map(prev.map((c) => [c.id, c] as const));
          for (const c of d.cities ?? []) m.set(c.id, c);
          return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
        });
      }
    } catch {
      /* 도시 목록 없음 — 검색으로 다시 시도 */
    }
  }, []);

  useEffect(() => {
    void loadCities("");
  }, [loadCities]);

  useEffect(() => {
    if (!lguId) return;
    let alive = true;
    setLoading(true);
    setFailed(false);
    void fetch(`/api/admin/home-layout/stores-preview?lguId=${encodeURIComponent(lguId)}`, { cache: "no-store", credentials: "include" })
      .then((r) => r.json())
      .then((d: { ok?: boolean; stores?: AdminHomeStorePreviewRow[]; outOfArea?: number }) => {
        if (!alive) return;
        if (!d.ok) {
          setFailed(true);
          setRows(null);
          return;
        }
        setRows(d.stores ?? []);
        setOutOfArea(d.outOfArea ?? 0);
      })
      .catch(() => {
        if (alive) {
          setFailed(true);
          setRows(null);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [lguId]);

  /** 앱과 같은 순서 규칙 — 직접 고르기 = 고른 순서, 자동 = 조건으로 거른 뒤 영업 중 먼저 */
  const ordered = useMemo(() => {
    if (!rows) return [];
    if (st.mode === "manual") {
      const byId = new Map(rows.map((r) => [r.id, r] as const));
      return st.picks.map((p) => byId.get(p.storeId)).filter((r): r is AdminHomeStorePreviewRow => Boolean(r));
    }
    let pool = rows;
    if (st.autoCategorySlugs.length > 0) {
      const cats = new Set(st.autoCategorySlugs);
      pool = pool.filter((r) => r.categorySlug != null && cats.has(r.categorySlug));
    }
    if (st.autoFilter === "recent_orders") pool = pool.filter((r) => r.completedOrderCount30d > 0);
    if (st.autoFilter === "newest") {
      pool = [...pool].sort((a, b) => (b.firstListedAt ? Date.parse(b.firstListedAt) : 0) - (a.firstListedAt ? Date.parse(a.firstListedAt) : 0));
    }
    return [...pool.filter((r) => r.status === "open"), ...pool.filter((r) => r.status !== "open")];
  }, [rows, st.mode, st.picks, st.autoCategorySlugs, st.autoFilter]);

  /** 앱은 보일 메뉴가 없는 매장을 건너뛰고 다음 매장으로 채운다 — 그 순서대로 「첫 화면」 표시 */
  const marked = useMemo(() => {
    const withMenu = ordered.filter((r) => r.visibleMenuCount > 0).slice(0, st.showCount);
    const firstIds = new Set(withMenu.map((r) => r.id));
    return ordered.map((r) => ({ r, noMenu: r.visibleMenuCount === 0, first: firstIds.has(r.id) }));
  }, [ordered, st.showCount]);

  return (
    <div className={BOX_CLS} data-admin-home-stores-preview>
      <b className="sam-text-section-title">{tr("admin_home_layout_preview_by_city")}</b>
      <p className="mt-1 sam-text-helper text-sam-muted">{tr("admin_home_layout_preview_by_city_hint")}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <select className={INPUT_CLS} value={lguId} onChange={(e) => setLguId(e.target.value)}>
          <option value="">{tr("admin_home_layout_preview_city_select")}</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            className={INPUT_CLS}
            value={cityQ}
            placeholder={tr("admin_home_layout_preview_city_search_ph")}
            onChange={(e) => setCityQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && cityQ.trim().length >= 2) void loadCities(cityQ.trim());
            }}
          />
          <AdminActionButton size="sm" disabled={cityQ.trim().length < 2} onClick={() => void loadCities(cityQ.trim())}>
            {tr("admin_home_layout_stores_search")}
          </AdminActionButton>
        </div>
      </div>
      {loading ? <p className="mt-2 sam-text-helper text-sam-muted">{tr("admin_home_layout_loading")}</p> : null}
      {failed ? <p className="mt-2 sam-text-helper text-sam-danger">{tr("admin_home_layout_err_read_failed")}</p> : null}
      {rows && !loading ? (
        <div className="mt-2">
          {ordered.length === 0 ? <p className="sam-text-helper text-sam-muted">{tr("admin_home_layout_preview_empty")}</p> : null}
          {marked.map(({ r, noMenu, first }) => {
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-2 border-t border-sam-border py-1.5 first:border-t-0">
                <span className="min-w-0 flex-1">
                  <span className="block truncate sam-text-body font-semibold">{r.name}</span>
                  <span className="block sam-text-helper text-sam-muted">
                    {[
                      r.categoryName,
                      tr(storeDisplayStatusLabelKey(r.status)),
                      r.distanceKm != null ? tr("admin_home_layout_preview_distance", { km: r.distanceKm }) : null,
                      tr("admin_home_layout_preview_menus", { count: r.visibleMenuCount }),
                      r.isSample ? tr("admin_home_layout_chip_sample") : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span
                  className={`rounded-ui-rect px-1.5 py-0.5 sam-text-helper ${
                    noMenu
                      ? "bg-sam-danger-soft text-sam-danger"
                      : first
                        ? "bg-sam-success-soft text-sam-success"
                        : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {noMenu
                    ? tr("admin_home_layout_preview_no_menu")
                    : first
                      ? tr("admin_home_layout_preview_first")
                      : tr("admin_home_layout_preview_next")}
                </span>
              </div>
            );
          })}
          {outOfArea > 0 ? (
            <p className="mt-2 sam-text-helper text-sam-muted">{tr("admin_home_layout_preview_out_of_area", { count: outOfArea })}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StoresTab({
  draft,
  setDraft,
  tr,
  language,
  catalog,
}: {
  draft: HomeLayoutConfig;
  setDraft: SetDraft;
  tr: Tr;
  language: string;
  catalog: HomeCatalog;
}) {
  const st = draft.stores;
  const setStores = (p: Partial<HomeLayoutConfig["stores"]>) => setDraft((d) => ({ ...d, stores: { ...d.stores, ...p } }));
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AdminHomeStoreRow[] | null>(null);
  const [info, setInfo] = useState<Map<string, AdminHomeStoreRow>>(() => new Map());
  const [openPick, setOpenPick] = useState<string | null>(null);
  const idsKey = st.picks.map((p) => p.storeId).join(",");

  const remember = useCallback((rows: AdminHomeStoreRow[]) => {
    setInfo((prev) => {
      const m = new Map(prev);
      for (const s of rows) m.set(s.id, s);
      return m;
    });
  }, []);

  useEffect(() => {
    if (!idsKey) return;
    let alive = true;
    void fetch(`/api/admin/home-layout/stores?ids=${encodeURIComponent(idsKey)}`, { cache: "no-store", credentials: "include" })
      .then((r) => r.json())
      .then((d: { ok?: boolean; stores?: AdminHomeStoreRow[] }) => {
        if (alive && d.ok) remember(d.stores ?? []);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [idsKey, remember]);

  const search = async () => {
    const term = q.trim();
    if (term.length < 2) return;
    try {
      const r = await fetch(`/api/admin/home-layout/stores?q=${encodeURIComponent(term)}`, { cache: "no-store", credentials: "include" });
      const d = (await r.json()) as { ok?: boolean; stores?: AdminHomeStoreRow[] };
      setResults(d.ok ? (d.stores ?? []) : []);
      if (d.ok) remember(d.stores ?? []);
    } catch {
      setResults([]);
    }
  };

  const addPick = (id: string) => {
    if (st.picks.some((p) => p.storeId === id) || st.picks.length >= HOME_STORE_PICKS_MAX) return;
    setStores({ picks: [...st.picks, { storeId: id, menuMode: "auto", productIds: [], adLabel: false }] });
  };
  const patchPick = (id: string, next: HomeStorePick) => setStores({ picks: st.picks.map((p) => (p.storeId === id ? next : p)) });

  return (
    <div className="space-y-3">
      <div className={BOX_CLS}>
        <SectionTitleField draft={draft} sectionKey="stores" setDraft={setDraft} tr={tr} />
        <Field label={tr("admin_home_layout_stores_mode")}>
          <Seg
            value={st.mode}
            onChange={(v) => setStores({ mode: v })}
            options={[
              { value: "manual", label: tr("admin_home_layout_mode_manual") },
              { value: "auto", label: tr("admin_home_layout_mode_auto") },
            ]}
          />
        </Field>
        <Field label={tr("admin_home_layout_show_count")}>
          <Seg
            value={st.showCount}
            onChange={(v) => setStores({ showCount: v })}
            options={range(HOME_STORE_SHOW_MIN, HOME_STORE_SHOW_MAX).map((n) => ({ value: n, label: String(n) }))}
          />
        </Field>
        <Field label={tr("admin_home_layout_menus_per_store")}>
          <Seg
            value={st.menusPerStore}
            onChange={(v) => setStores({ menusPerStore: v })}
            options={range(HOME_STORE_MENUS_MIN, HOME_STORE_MENUS_MAX).map((n) => ({ value: n, label: String(n) }))}
          />
        </Field>
      </div>

      {st.mode === "auto" ? (
        <div className={BOX_CLS}>
          <Field label={tr("admin_home_layout_auto_categories")}>
            <div className="flex flex-wrap gap-2">
              {catalog.storeCategories.map((c) => {
                const on = st.autoCategorySlugs.includes(c.slug);
                return (
                  <AdminChipButton
                    key={c.slug}
                    selected={on}
                    onClick={() =>
                      setStores({
                        autoCategorySlugs: on ? st.autoCategorySlugs.filter((s) => s !== c.slug) : [...st.autoCategorySlugs, c.slug],
                      })
                    }
                  >
                    <Thumb src={c.imageUrl} size={22} round />
                    {homeCatalogName(c, language)}
                  </AdminChipButton>
                );
              })}
            </div>
          </Field>
          <Field label={tr("admin_home_layout_auto_filter")}>
            <Seg
              value={st.autoFilter}
              onChange={(v) => setStores({ autoFilter: v })}
              options={HOME_STORE_AUTO_FILTERS.map((f) => ({ value: f, label: tr(FILTER_LABEL[f]) }))}
            />
          </Field>
        </div>
      ) : (
        <div className={BOX_CLS}>
          <p className="sam-text-body text-sam-muted">{tr("admin_home_layout_stores_manual_hint", { max: HOME_STORE_PICKS_MAX })}</p>
          <div className="mt-2 flex gap-2">
            <input
              className={INPUT_CLS}
              value={q}
              placeholder={tr("admin_home_layout_stores_search_ph")}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void search();
              }}
            />
            <AdminActionButton onClick={() => void search()} disabled={q.trim().length < 2}>
              {tr("admin_home_layout_stores_search")}
            </AdminActionButton>
          </div>
          {results ? (
            <div className="mt-2 max-h-72 overflow-y-auto">
              {results.length === 0 ? <p className="sam-text-helper text-sam-muted">{tr("admin_home_layout_stores_no_result")}</p> : null}
              {results.map((s) => {
                const added = st.picks.some((p) => p.storeId === s.id);
                return (
                  <div key={s.id} className="flex flex-wrap items-center gap-2 border-t border-sam-border py-2 first:border-t-0">
                    <Thumb src={s.profileImageUrl} size={36} round />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate sam-text-body font-semibold">{s.name}</span>
                      <span className="block sam-text-helper text-sam-muted">{[s.categoryName, s.city].filter(Boolean).join(" · ")}</span>
                    </span>
                    <StoreChips s={s} tr={tr} />
                    <AdminActionButton size="sm" disabled={added || st.picks.length >= HOME_STORE_PICKS_MAX} onClick={() => addPick(s.id)}>
                      {added ? tr("admin_home_layout_stores_added") : tr("admin_home_layout_stores_add")}
                    </AdminActionButton>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="mb-1 mt-4 sam-text-section-title font-semibold">
            {tr("admin_home_layout_stores_picked", { count: st.picks.length, max: HOME_STORE_PICKS_MAX })}
          </div>
          {st.picks.length === 0 ? <p className="sam-text-helper text-sam-muted">{tr("admin_home_layout_stores_none")}</p> : null}
          {st.picks.map((p, i) => {
            const s = info.get(p.storeId);
            const reasons = s ? storeNotShownReasons(s, tr) : [];
            const open = openPick === p.storeId;
            return (
              <div key={p.storeId} className={`border-t border-sam-border py-2 first:border-t-0 ${open ? "-mx-4 bg-sam-primary-soft px-4" : ""}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <AdminListItemButton
                    selected={open}
                    className="flex min-w-0 flex-1 items-center gap-2"
                    onClick={() => setOpenPick(open ? null : p.storeId)}
                  >
                    <Thumb src={s?.profileImageUrl ?? null} size={36} round />
                    <span className="min-w-0">
                      <span className="block truncate sam-text-body font-semibold">{s?.name ?? p.storeId}</span>
                      <span className="block sam-text-helper text-sam-muted">
                        {tr(p.menuMode === "auto" ? "admin_home_layout_menu_auto" : "admin_home_layout_menu_manual")}
                        {p.menuMode === "manual" ? ` ${p.productIds.length}` : ""}
                        {p.adLabel ? ` · ${tr("home_ad")}` : ""}
                      </span>
                    </span>
                  </AdminListItemButton>
                  <Arrows tr={tr} i={i} n={st.picks.length} onMove={(dir) => setStores({ picks: move(st.picks, i, dir) })} />
                  <AdminActionButton size="sm" onClick={() => setStores({ picks: st.picks.filter((x) => x.storeId !== p.storeId) })}>
                    {tr("admin_home_layout_remove")}
                  </AdminActionButton>
                </div>
                {s ? (
                  <div className="mt-1">
                    <StoreChips s={s} tr={tr} />
                  </div>
                ) : null}
                {reasons.length > 0 ? (
                  <p className="mt-1 sam-text-helper text-sam-danger">{tr("admin_home_layout_not_shown", { reasons: reasons.join(", ") })}</p>
                ) : null}
                {s?.isSample ? <p className="mt-1 sam-text-helper text-sam-warning">{tr("admin_home_layout_sample_note")}</p> : null}
                {open ? (
                  <div className="mt-2">
                    <PickMenus pick={p} onChange={(next) => patchPick(p.storeId, next)} tr={tr} />
                    <div className="mt-2">
                      <Check
                        checked={p.adLabel}
                        onChange={(v) => patchPick(p.storeId, { ...p, adLabel: v })}
                        label={tr("admin_home_layout_store_ad_label")}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <StoresPreviewBox st={st} tr={tr} />

      <div className={`${BOX_CLS} bg-sam-surface-muted`}>
        <b className="sam-text-body">{tr("admin_home_layout_fixed_rules_title")}</b>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 sam-text-helper text-sam-muted">
          <li>{tr("admin_home_layout_fixed_rule_area")}</li>
          <li>{tr("admin_home_layout_fixed_rule_open")}</li>
          <li>{tr("admin_home_layout_fixed_rule_guest")}</li>
          <li>{tr("admin_home_layout_fixed_rule_order")}</li>
          <li>{tr("admin_home_layout_fixed_rule_rotate")}</li>
          <li>{tr("admin_home_layout_fixed_rule_tap")}</li>
        </ul>
      </div>
    </div>
  );
}

/* ───────────── 탭: 거래 · 교민 이야기 · 상단 · 칸 순서 ───────────── */

function TradesTab({
  draft,
  setDraft,
  tr,
  language,
  catalog,
}: {
  draft: HomeLayoutConfig;
  setDraft: SetDraft;
  tr: Tr;
  language: string;
  catalog: HomeCatalog;
}) {
  const td = draft.trades;
  const set = (p: Partial<HomeLayoutConfig["trades"]>) => setDraft((d) => ({ ...d, trades: { ...d.trades, ...p } }));
  return (
    <div className={BOX_CLS}>
      <SectionTitleField draft={draft} sectionKey="trades" setDraft={setDraft} tr={tr} />
      <Field label={tr("admin_home_layout_count")}>
        <Seg
          value={td.count}
          onChange={(v) => set({ count: v })}
          options={range(HOME_TRADES_MIN, HOME_TRADES_MAX).map((n) => ({ value: n, label: String(n) }))}
        />
      </Field>
      <Field label={tr("admin_home_layout_trades_category")}>
        <select className={INPUT_CLS} value={td.tradeCategoryId} onChange={(e) => set({ tradeCategoryId: e.target.value })}>
          <option value="">{tr("admin_home_layout_all_option")}</option>
          {catalog.tradeCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {homeCatalogName(c, language)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={tr("admin_home_layout_sort")} hint={tr("admin_home_layout_trades_rule")}>
        <Seg
          value={td.sort}
          onChange={(v) => set({ sort: v })}
          options={[
            { value: "latest", label: tr("admin_home_layout_sort_latest") },
            { value: "popular", label: tr("admin_home_layout_sort_popular") },
          ]}
        />
      </Field>
    </div>
  );
}

function PostsTab({
  draft,
  setDraft,
  tr,
  language,
  catalog,
}: {
  draft: HomeLayoutConfig;
  setDraft: SetDraft;
  tr: Tr;
  language: string;
  catalog: HomeCatalog;
}) {
  const ps = draft.posts;
  const set = (p: Partial<HomeLayoutConfig["posts"]>) => setDraft((d) => ({ ...d, posts: { ...d.posts, ...p } }));
  return (
    <div className={BOX_CLS}>
      <SectionTitleField draft={draft} sectionKey="posts" setDraft={setDraft} tr={tr} />
      <Field label={tr("admin_home_layout_count")}>
        <Seg
          value={ps.count}
          onChange={(v) => set({ count: v })}
          options={range(HOME_POSTS_MIN, HOME_POSTS_MAX).map((n) => ({ value: n, label: String(n) }))}
        />
      </Field>
      <Field label={tr("admin_home_layout_posts_topic")}>
        <select className={INPUT_CLS} value={ps.topicSlug} onChange={(e) => set({ topicSlug: e.target.value })}>
          <option value="">{tr("admin_home_layout_all_option")}</option>
          {catalog.communityTopics.map((c) => (
            <option key={c.slug} value={c.slug}>
              {homeCatalogName(c, language)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={tr("admin_home_layout_sort")} hint={tr("admin_home_layout_posts_rule")}>
        <Seg value={ps.sort} onChange={(v) => set({ sort: v })} options={HOME_POST_SORTS.map((s) => ({ value: s, label: tr(POST_SORT_LABEL[s]) }))} />
      </Field>
    </div>
  );
}

function HeaderTab({ draft, setDraft, tr }: { draft: HomeLayoutConfig; setDraft: SetDraft; tr: Tr }) {
  return (
    <div className={BOX_CLS}>
      <Field label={tr("admin_home_layout_tab_header")}>
        <Check
          checked={draft.header.showAddress}
          onChange={(v) => setDraft((d) => ({ ...d, header: { ...d.header, showAddress: v } }))}
          label={tr("admin_home_layout_header_show_address")}
        />
      </Field>
      <Field
        label={tr("admin_home_layout_header_placeholder")}
        hint={tr("admin_home_layout_header_placeholder_hint", { text: tr("home_search_placeholder") })}
      >
        <TextPair
          tr={tr}
          value={draft.header.searchPlaceholder}
          max={HOME_SEARCH_PLACEHOLDER_MAX}
          placeholderKo={tr("home_search_placeholder")}
          onChange={(v) => setDraft((d) => ({ ...d, header: { ...d.header, searchPlaceholder: v } }))}
        />
      </Field>
    </div>
  );
}

function SectionsTab({ draft, setDraft, tr }: { draft: HomeLayoutConfig; setDraft: SetDraft; tr: Tr }) {
  const patch = (key: HomeSectionKey, p: { visible?: boolean; guestVisible?: boolean }) =>
    setDraft((d) => ({ ...d, sections: d.sections.map((x) => (x.key === key ? { ...x, ...p } : x)) }));
  return (
    <div className={BOX_CLS}>
      <p className="mb-2 sam-text-helper text-sam-muted">{tr("admin_home_layout_sections_hint")}</p>
      {draft.sections.map((s, i) => {
        const memberOnly = HOME_SECTIONS_MEMBER_ONLY.has(s.key);
        return (
          <div key={s.key} className="flex flex-wrap items-center gap-3 border-t border-sam-border py-2.5 first:border-t-0">
            <span className="min-w-[160px] sam-text-body font-semibold">{tr(HOME_SECTION_LABEL_KEYS[s.key])}</span>
            <Check checked={s.visible} onChange={(v) => patch(s.key, { visible: v })} label={tr("admin_home_layout_visible")} />
            <Check
              checked={memberOnly ? false : s.guestVisible}
              disabled={memberOnly}
              onChange={(v) => patch(s.key, { guestVisible: v })}
              label={tr("admin_home_layout_guest_visible")}
            />
            {memberOnly ? <span className="sam-text-helper text-sam-muted">{tr("admin_home_layout_member_only_hint")}</span> : null}
            <span className="ml-auto">
              <Arrows
                tr={tr}
                i={i}
                n={draft.sections.length}
                onMove={(dir) => setDraft((d) => ({ ...d, sections: move(d.sections, i, dir) }))}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────── 페이지 ───────────── */

/**
 * 어드민 「홈 구성」 — 앱 홈의 모든 칸을 여기서 정한다 (Owner 「이대로 구현」 2026-11-09, 홈 시안 v22).
 * 저장 = 읽은 판(`updated_at`)과 다르면 409 로 멈춤 · 저장 기록 남김 · 앱은 다음 새로고침·재접속에 반영.
 */
/** 저장 오류 코드 → 문구 (감사 E9 — 코드값을 그대로 보이지 않는다) */
const SAVE_ERROR_KEY: Readonly<Record<string, MessageKey>> = {
  banner_title_required: "admin_home_layout_err_banner_title",
  banner_image_required: "admin_home_layout_err_banner_image",
  invalid_banner_href: "admin_home_layout_err_banner_href",
  invalid_banner: "admin_home_layout_err_banner_title",
  too_many_banners: "admin_home_layout_err_too_many_banners",
  too_many_store_picks: "admin_home_layout_err_too_many_picks",
  too_many_large_cards: "admin_home_layout_err_too_many_large",
  too_many_small_cards: "admin_home_layout_err_too_many_small",
  too_many_shortcuts: "admin_home_layout_err_too_many_shortcuts",
  invalid_schema_version: "admin_home_layout_err_schema",
  invalid_body: "admin_home_layout_err_schema",
  invalid_json: "admin_home_layout_err_schema",
  invalid_expected_revision: "admin_home_layout_err_schema",
  read_failed: "admin_home_layout_err_read_failed",
  save_failed: "admin_home_layout_err_save_failed",
  supabase_unconfigured: "admin_home_layout_err_read_failed",
};

/**
 * 저장 전 검사 — 서버(`validateHomeLayoutPayload`)와 같은 배너 규칙. 걸린 배너 id·코드를 돌려준다.
 * 꺼 둔 배너도 서버가 검사하므로 똑같이 본다.
 */
function findBannerProblem(d: HomeLayoutConfig): { id: string; code: string } | null {
  for (const b of d.banners) {
    if (!b.title.ko.trim()) return { id: b.id, code: "banner_title_required" };
    if (!isSafeHomeImageUrl(b.imageUrl)) return { id: b.id, code: "banner_image_required" };
    if (!isSafeHomeHref(b.href)) return { id: b.id, code: "invalid_banner_href" };
  }
  return null;
}

export function AdminHomeLayoutPage() {
  const { language, t: tr } = useI18n();
  const ko = language !== "en";
  const adminAction = useAdminRouteAction("/admin/menus/home-layout");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saved, setSaved] = useState<HomeLayoutConfig | null>(null);
  const [draft, setDraftState] = useState<HomeLayoutConfig | null>(null);
  const [revision, setRevision] = useState<string | null>(null);
  const [source, setSource] = useState<"db" | "default">("default");
  const [catalog, setCatalog] = useState<HomeCatalog>(EMPTY_CATALOG);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [tab, setTab] = useState<TabKey>("banners");
  const [bannerFocus, setBannerFocus] = useState<{ id: string; nonce: number } | null>(null);

  const setDraft = useCallback<SetDraft>((fn) => {
    setDraftState((d) => (d ? fn(d) : d));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/home-layout", { cache: "no-store", credentials: "include" });
      const data = (await res.json()) as LoadResponse;
      if (!res.ok || !data.ok || !data.config) throw new Error(data.error ?? `http_${res.status}`);
      setSaved(cloneHomeLayout(data.config));
      setDraftState(cloneHomeLayout(data.config));
      setRevision(data.revision ?? null);
      setSource(data.source ?? "default");
      setCatalog(data.catalog ?? EMPTY_CATALOG);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "load_failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(draft), [saved, draft]);

  const errorText = (code: string) => {
    const key = SAVE_ERROR_KEY[code];
    return key ? tr(key) : tr("admin_home_layout_save_failed", { reason: code });
  };

  const save = async () => {
    if (!draft) return;
    const problem = findBannerProblem(draft);
    if (problem) {
      setTab("banners");
      setBannerFocus((prev) => ({ id: problem.id, nonce: (prev?.nonce ?? 0) + 1 }));
      setMessage({ type: "err", text: errorText(problem.code) });
      return;
    }
    const ok = await confirmAdminAction({
      level: adminActionLevel("runtimeSettingChange"),
      ko,
      title: tr("admin_home_layout_confirm_title"),
      description: tr("admin_home_layout_confirm_body"),
      confirmLabel: tr("admin_home_layout_save"),
    });
    if (!ok.ok) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/home-layout", {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config: draft, expectedRevision: revision }),
      });
      const data = (await res.json().catch(() => ({ ok: false }))) as LoadResponse;
      if (res.status === 409) {
        setMessage({ type: "err", text: tr("admin_home_layout_conflict") });
        return;
      }
      if (!res.ok || !data.ok || !data.config) {
        setMessage({ type: "err", text: errorText(data.error ?? `http_${res.status}`) });
        return;
      }
      setSaved(cloneHomeLayout(data.config));
      setDraftState(cloneHomeLayout(data.config));
      setRevision(data.revision ?? null);
      setSource("db");
      setMessage({ type: "ok", text: tr("admin_home_layout_saved") });
    } catch {
      setMessage({ type: "err", text: tr("admin_home_layout_err_network") });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <AdminLoadingState ko={ko} label={tr("admin_home_layout_loading")} />;
  if (loadError || !draft) {
    return <AdminErrorState ko={ko} code={loadError ?? "load_failed"} onRetry={() => void load()} />;
  }

  return (
    <div className="space-y-4" data-admin-home-layout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminPageHeader titleKey="admin_menu_home_layout" description={tr("admin_home_layout_desc")} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-ui-rect bg-sam-surface-muted px-2.5 py-1 sam-text-helper text-sam-muted">
            {source === "db" ? tr("admin_home_layout_saved_badge") : tr("admin_home_layout_default_badge")}
          </span>
          {dirty ? (
            <span className="rounded-ui-rect bg-sam-warning-soft px-2.5 py-1 sam-text-helper text-sam-warning">
              {tr("admin_home_layout_dirty")}
            </span>
          ) : null}
          <AdminActionButton
            variant="primary"
            /* 저장값이 없을 때(기본 구성)는 바꾸지 않아도 그대로 저장할 수 있다 (감사 E13) */
            disabled={(!dirty && source === "db") || saving || !adminAction.allowed}
            title={adminAction.reason ?? undefined}
            onClick={() => void save()}
          >
            {saving ? tr("admin_home_layout_saving") : tr("admin_home_layout_save")}
          </AdminActionButton>
          {dirty ? (
            <AdminActionButton disabled={saving} onClick={() => setDraftState(saved ? cloneHomeLayout(saved) : draft)}>
              {tr("admin_home_layout_revert")}
            </AdminActionButton>
          ) : null}
        </div>
      </div>

      {message ? (
        <div
          className={`rounded-ui-rect px-4 py-2 sam-text-body ${
            message.type === "ok" ? "bg-sam-success-soft text-sam-success" : "bg-sam-danger-soft text-sam-danger"
          }`}
        >
          {message.text}
        </div>
      ) : null}
      {!adminAction.allowed && adminAction.reason ? <p className="sam-text-body-secondary text-sam-muted">{adminAction.reason}</p> : null}

      <AdminTabs
        tabs={TABS.map((x) => ({
          id: x.key,
          label: tr(x.label),
          count: x.key === "banners" ? draft.banners.length : null,
        }))}
        ariaLabel={tr("admin_menu_home_layout")}
        value={tab}
        onChange={(id) => setTab(id as typeof tab)}
        syncUrl={false}
      />

      {tab === "banners" ? (
        <BannersTab draft={draft} setDraft={setDraft} tr={tr} language={language} focus={bannerFocus} />
      ) : null}
      {tab === "services" ? <ServicesTab draft={draft} setDraft={setDraft} tr={tr} /> : null}
      {tab === "categories" ? (
        <CategoriesTab draft={draft} setDraft={setDraft} tr={tr} language={language} catalog={catalog} />
      ) : null}
      {tab === "stores" ? <StoresTab draft={draft} setDraft={setDraft} tr={tr} language={language} catalog={catalog} /> : null}
      {tab === "trades" ? <TradesTab draft={draft} setDraft={setDraft} tr={tr} language={language} catalog={catalog} /> : null}
      {tab === "posts" ? <PostsTab draft={draft} setDraft={setDraft} tr={tr} language={language} catalog={catalog} /> : null}
      {tab === "header" ? <HeaderTab draft={draft} setDraft={setDraft} tr={tr} /> : null}
      {tab === "sections" ? <SectionsTab draft={draft} setDraft={setDraft} tr={tr} /> : null}
    </div>
  );
}
