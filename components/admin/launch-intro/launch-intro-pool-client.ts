"use client";

/**
 * 앱 진입 어드민 v3 — 인트로 목록·편집 화면 공용 클라이언트 함수(요청 · 오류 문구 · 그림 색 고르기).
 */
import type { MessageKey } from "@/lib/i18n/messages";
import { LAUNCH_INTRO_POOL_MAX_ACTIVE, LAUNCH_INTRO_POOL_NAME_MAX } from "@/lib/launch-intro/pool";
import { dominantBorderColor } from "@/lib/launch-intro/pool-admin-view";

export const LAUNCH_INTRO_POOL_API = "/api/admin/launch-intro/pool";

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** 서버 오류 코드 → 화면 문구 */
export function launchIntroPoolErrorText(code: string, t: T): string {
  switch (code) {
    case "stale_revision":
      return t("admin_launch_intro_pool_err_stale");
    case "fullscreen_image_too_small":
      return t("admin_launch_intro_pool_err_small");
    case "image_type_invalid":
      return t("admin_launch_intro_pool_err_image");
    case "image_required":
    case "draft_image_missing":
      return t("admin_launch_intro_v3_err_image_required");
    case "cta_invalid":
      return t("admin_launch_intro_pool_err_cta");
    case "cta_pick_required":
      return t("admin_launch_intro_v3_err_cta_pick");
    case "active_cannot_delete":
      return t("admin_launch_intro_pool_err_delete_active");
    case "window_invalid":
      return t("admin_launch_intro_pool_err_window");
    case "kind_column_missing":
      return t("admin_launch_intro_v3_err_kind_column_missing");
    case "ad_label_required":
      return t("admin_launch_intro_v3_err_ad_label_required");
    case "name_invalid":
      return t("admin_launch_intro_v3_err_name", { max: LAUNCH_INTRO_POOL_NAME_MAX });
    case "background_invalid":
      return t("admin_launch_intro_v3_err_background");
    default:
      return t("admin_launch_intro_pool_err_save");
  }
}

export const LAUNCH_INTRO_POOL_CAP = LAUNCH_INTRO_POOL_MAX_ACTIVE;

export async function launchIntroPoolRequest(
  url: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown
): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  try {
    const res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || json.ok !== true) {
      return { ok: false, status: res.status, error: typeof json.error === "string" ? json.error : "save_failed" };
    }
    return { ok: true, json };
  } catch {
    return { ok: false, status: 0, error: "network" };
  }
}

/** 그림 초안 올리기 — 기존 인트로 업로드 2단계(start → 서명 주소 PUT → finish). 초안 경로를 돌려준다. */
export async function uploadLaunchIntroDraftImage(file: File): Promise<string> {
  const post = async (body: unknown) => {
    const res = await fetch("/api/admin/launch-intro/upload", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Record<string, unknown>;
    if (!json.ok) throw new Error(json.error ?? String(res.status));
    return json;
  };
  const start = (await post({ action: "start", mime: file.type, bytes: file.size })) as unknown as {
    path: string;
    signedUrl: string;
  };
  const put = await fetch(start.signedUrl, {
    method: "PUT",
    headers: { "content-type": file.type, "x-upsert": "false" },
    body: file,
  });
  if (!put.ok) throw new Error(`storage_${put.status}`);
  const done = (await post({ action: "finish", path: start.path })) as unknown as {
    kind: string;
    ref: { draftPath?: string };
  };
  if (done.kind !== "image" || !done.ref.draftPath) throw new Error("image_type_invalid");
  return done.ref.draftPath;
}

/** 「그림에서 고르기」 — 그림을 최대 256px 로 줄여 가장자리 색을 센다. 읽을 수 없으면(교차 출처 등) null. */
export async function pickLaunchIntroBorderColor(src: string): Promise<string | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = "anonymous";
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image_decode_failed"));
      el.src = src;
    });
    const scale = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    return dominantBorderColor(ctx.getImageData(0, 0, w, h).data, w, h);
  } catch {
    return null;
  }
}
