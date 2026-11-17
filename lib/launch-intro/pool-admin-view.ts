/**
 * 앱 진입 어드민 v3 §2·§3 (Owner 2026-11-17 「v3대로 진행」) — 인트로 목록·편집 화면의 순수 계산(서버·클라이언트 공용).
 *
 * - 앱 배치 값은 네이티브 인트로(`android/.../DibayNativeIntro.java`)와 같다: 위 56dp(「광고」 왼쪽 · 건너뛰기 오른쪽) ·
 *   아래 88dp(앱 아이콘 28dp + dibaY 22sp, Y = #E0A800) · 그 사이 그림 칸(FIT_CENTER = 비율 유지 · 잘림 없음) · 남는 곳 배경색.
 * - 「앱에 나오나」는 여기서 계산하지 않는다 — 서버 `computeLaunchIntroPoolApplied` 결과를 그대로 쓴다.
 */
import { destinationHref, parseDestinationHref } from "@/lib/destination/destination-contract";
import { isoToManilaLocal } from "@/lib/launch-intro/schedule";
import type { LaunchIntroPoolApplied, LaunchIntroPoolKind } from "@/lib/launch-intro/pool";

/** 브랜드 줄 「dibaY」 의 Y 색 (네이티브와 같은 값) */
export const LAUNCH_INTRO_BRAND_ACCENT = "#E0A800";
/** 새 소재 기본 배경색 (DB 기본값과 같은 값) */
export const LAUNCH_INTRO_POOL_DEFAULT_BG = "#075740";
/** 「광고」·건너뛰기 알약 배경 (네이티브 argb(140,0,0,0)) */
export const LAUNCH_INTRO_PILL_BG = "rgba(0,0,0,0.55)";

/** 네이티브 인트로 배치(dp) */
export const LAUNCH_INTRO_NATIVE_LAYOUT = {
  statusBarDp: 24,
  topRowDp: 56,
  bottomRowDp: 88,
  brandIconDp: 28,
  brandTextSp: 22,
  pillTextSp: 12,
  adPillTopDp: 16,
  adPillSideDp: 16,
  skipPillTopDp: 12,
  skipPillSideDp: 12,
} as const;

/** 미리보기 기기 3종 — 세로 화면 크기(dp). 20:9 = 360×800 · 16:9 = 360×640 · 4:3 태블릿 = 768×1024 */
export const LAUNCH_INTRO_PREVIEW_DEVICES = [
  { id: "tall", widthDp: 360, heightDp: 800 },
  { id: "normal", widthDp: 360, heightDp: 640 },
  { id: "tablet", widthDp: 768, heightDp: 1024 },
] as const;
export type LaunchIntroPreviewDeviceId = (typeof LAUNCH_INTRO_PREVIEW_DEVICES)[number]["id"];

export type IntroRect = { x: number; y: number; width: number; height: number };

/** 기기 화면(dp) 안 그림 칸과, 그 칸에 비율 유지로 맞춘 그림 위치(dp) */
export function launchIntroPreviewGeometry(
  device: { widthDp: number; heightDp: number },
  image: { width: number; height: number } | null
): { imageBox: IntroRect; image: IntroRect | null; topRow: IntroRect; bottomRow: IntroRect } {
  const L = LAUNCH_INTRO_NATIVE_LAYOUT;
  const top = L.statusBarDp;
  const topRow = { x: 0, y: top, width: device.widthDp, height: L.topRowDp };
  const bottomRow = { x: 0, y: device.heightDp - L.bottomRowDp, width: device.widthDp, height: L.bottomRowDp };
  const imageBox = {
    x: 0,
    y: top + L.topRowDp,
    width: device.widthDp,
    height: Math.max(0, device.heightDp - top - L.topRowDp - L.bottomRowDp),
  };
  if (!image || image.width <= 0 || image.height <= 0 || imageBox.height <= 0) {
    return { imageBox, image: null, topRow, bottomRow };
  }
  const scale = Math.min(imageBox.width / image.width, imageBox.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    imageBox,
    image: { x: (imageBox.width - width) / 2, y: imageBox.y + (imageBox.height - height) / 2, width, height },
    topRow,
    bottomRow,
  };
}

function hex2(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0").toUpperCase();
}

/**
 * 「그림에서 고르기」 — 그림 가장자리(바깥 `ring` 픽셀) 중 가장 많은 색. 투명(알파 < 128)은 세지 않는다.
 * 색은 채널마다 16단계로 묶어 세고, 이긴 묶음 안 픽셀의 평균을 `#RRGGBB` 로 돌려준다. 셀 픽셀이 없으면 null.
 */
export function dominantBorderColor(data: ArrayLike<number>, width: number, height: number, ring = 2): string | null {
  if (width <= 0 || height <= 0) return null;
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  const add = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    if (data[i + 3] < 128) return;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const cur = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    cur.n += 1;
    cur.r += r;
    cur.g += g;
    cur.b += b;
    buckets.set(key, cur);
  };
  const k = Math.max(1, Math.min(ring, Math.floor(Math.min(width, height) / 2)));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x < k || y < k || x >= width - k || y >= height - k) add(x, y);
    }
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const v of buckets.values()) if (!best || v.n > best.n) best = v;
  if (!best) return null;
  return `#${hex2(best.r / best.n)}${hex2(best.g / best.n)}${hex2(best.b / best.n)}`;
}

export function isLaunchIntroHex(v: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(v.trim());
}

/** 누르면 이동 — 종류 */
export const LAUNCH_INTRO_CTA_TYPES = ["none", "event", "store", "screen", "external"] as const;
export type LaunchIntroCtaType = (typeof LAUNCH_INTRO_CTA_TYPES)[number];

/** 저장된 href → 칸 종류·값 (이벤트 = id, 매장 = slug, 앱 화면 = 경로, 외부 = https 주소) */
export function parseLaunchIntroCtaHref(href: string | null | undefined): { type: LaunchIntroCtaType; value: string } {
  const s = String(href ?? "").trim();
  if (!s) return { type: "none", value: "" };
  if (s.startsWith("https://")) return { type: "external", value: s };
  const parsed = parseDestinationHref(s);
  if (parsed.ok && parsed.ref.kind === "event") return { type: "event", value: parsed.ref.eventId };
  const store = /^\/stores\/([^/?#]+)\/?$/.exec(s);
  if (store && store[1] !== "owner") return { type: "store", value: decodeURIComponent(store[1]) };
  return { type: "screen", value: s };
}

/** 칸 종류·값 → 서버가 검사하는 href (`validateLaunchIntroPoolInput` cta 규칙). 비었으면 null. */
export function buildLaunchIntroCtaHref(type: LaunchIntroCtaType, value: string): string | null {
  const v = value.trim();
  if (type === "none" || !v) return null;
  if (type === "event") return destinationHref({ kind: "event", eventId: v });
  if (type === "store") return `/stores/${encodeURIComponent(v)}`;
  return v;
}

/** 이벤트 목적지로 고를 수 있는가 — 팝업 이벤트 목적지 확인(`popupEventLookupFromRow`)과 같은 규칙: 공개 + 시작됨 + 안 끝남 */
export function isLaunchIntroEventPickable(
  e: { status?: string | null; startsAt?: string | null; endsAt?: string | null },
  nowMs: number
): { ok: true } | { ok: false; reason: "not_published" | "not_started" | "ended" } {
  if (String(e.status ?? "").trim().toLowerCase() !== "published") return { ok: false, reason: "not_published" };
  const start = e.startsAt ? Date.parse(e.startsAt) : NaN;
  const end = e.endsAt ? Date.parse(e.endsAt) : NaN;
  if (Number.isFinite(end) && end < nowMs) return { ok: false, reason: "ended" };
  if (Number.isFinite(start) && start > nowMs) return { ok: false, reason: "not_started" };
  return { ok: true };
}

/** 목록 기간 칸 — PHT `MM-DD HH:mm` */
export function formatLaunchIntroPhtShort(iso: string | null | undefined): string {
  if (!iso || !Number.isFinite(Date.parse(iso))) return "";
  const local = isoToManilaLocal(iso);
  return `${local.slice(5, 10)} ${local.slice(11, 16)}`;
}

export type LaunchIntroListFilter = {
  state: "all" | "live" | "scheduled" | "off";
  kind: "all" | LaunchIntroPoolKind;
  q: string;
};

export function filterLaunchIntroItems<T extends { name: string; kind: LaunchIntroPoolKind; applied?: LaunchIntroPoolApplied }>(
  items: readonly T[],
  f: LaunchIntroListFilter
): T[] {
  const q = f.q.trim().toLowerCase();
  return items.filter(
    (it) =>
      (f.state === "all" || (it.applied?.state ?? "off") === f.state) &&
      (f.kind === "all" || it.kind === f.kind) &&
      (!q || it.name.toLowerCase().includes(q))
  );
}

/** 어드민 목록 응답 항목 (`GET /api/admin/launch-intro/pool`) */
export type LaunchIntroPoolAdminItem = {
  id: string;
  name: string;
  kind: LaunchIntroPoolKind;
  status: "active" | "paused" | "ended";
  sort_order: number;
  start_at: string | null;
  end_at: string | null;
  background_color: string;
  duration_ms: number;
  cta_href: string | null;
  show_ad_label: boolean;
  image_url: string;
  image_width: number;
  image_height: number;
  updated_at: string;
  stats: { impression: number; skip: number; click: number; complete: number } | null;
  applied?: LaunchIntroPoolApplied;
};

/** 끌어서 옮긴 결과 — from 자리 항목을 to 자리로 */
export function moveLaunchIntroItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return [...items];
  const next = [...items];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

/** 순서 저장 값 — 위에서부터 10, 20, 30 … */
export function launchIntroOrderPayload<T extends { id: string; updated_at: string }>(items: readonly T[]) {
  return items.map((it, i) => ({ id: it.id, expectedUpdatedAt: it.updated_at, sortOrder: (i + 1) * 10 }));
}
