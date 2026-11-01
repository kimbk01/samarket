/**
 * 출시 기록 자동 수집원 (앱 업데이트 v2 §3) — 서버 전용. 어드민 입력 없음.
 * - Android: Google Play Developer API 프로덕션 트랙 (`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` 이 있을 때만)
 * - iOS: App Store 공개 조회 (iTunes Lookup · 키 없음)
 * - 공통 대안: 기기가 보고한 설치 버전(`user_devices.app_version`) 중 가장 새 버전
 */
import "server-only";
import { createSign } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  compareVersionNames,
  parseAppVersionLabel,
  type AppReleasePlatform,
} from "@/lib/app-releases/app-release-version";

export const APP_PACKAGE_ID = "com.dibay.app";

export type CollectedRelease = {
  platform: AppReleasePlatform;
  version_name: string;
  version_code: number | null;
  notes_ko: string | null;
  notes_en: string | null;
  store_url: string | null;
  rollout_status: string | null;
  released_at: string | null;
  source: "play_api" | "itunes_lookup" | "device_seen";
};

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function googleAccessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/androidpublisher",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const sig = b64url(signer.sign(sa.private_key));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claim}.${sig}`,
    }),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!res.ok || !j.access_token) throw new Error(`play_token_failed:${j.error ?? res.status}`);
  return j.access_token;
}

type PlayRelease = {
  name?: string;
  versionCodes?: string[];
  status?: string;
  releaseNotes?: { language?: string; text?: string }[];
};

function pickNotes(notes: PlayRelease["releaseNotes"], lang: "ko" | "en"): string | null {
  const hit = (notes ?? []).find((n) => String(n.language ?? "").toLowerCase().startsWith(lang));
  const t = hit?.text?.trim();
  return t ? t.slice(0, 4000) : null;
}

/** Play 프로덕션 트랙. 키가 없으면 `null`(수집 안 함 — 오류 아님). */
export async function collectPlayReleases(): Promise<CollectedRelease[] | null> {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  const sa = JSON.parse(raw) as { client_email: string; private_key: string };
  const token = await googleAccessToken(sa);
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${APP_PACKAGE_ID}`;
  const auth = { Authorization: `Bearer ${token}` };
  const editRes = await fetch(`${base}/edits`, { method: "POST", headers: auth });
  const edit = (await editRes.json().catch(() => ({}))) as { id?: string };
  if (!editRes.ok || !edit.id) throw new Error(`play_edit_failed:${editRes.status}`);
  try {
    const trackRes = await fetch(`${base}/edits/${edit.id}/tracks/production`, { headers: auth });
    const track = (await trackRes.json().catch(() => ({}))) as { releases?: PlayRelease[] };
    if (!trackRes.ok) throw new Error(`play_track_failed:${trackRes.status}`);
    const out: CollectedRelease[] = [];
    for (const r of track.releases ?? []) {
      const codes = (r.versionCodes ?? []).map((c) => Number(c)).filter((n) => Number.isFinite(n));
      const code = codes.length > 0 ? Math.max(...codes) : null;
      const name = (r.name ?? "").trim().replace(/\s*\(\d+\)\s*$/, "") || (code != null ? String(code) : "");
      if (!name || r.status === "draft") continue;
      out.push({
        platform: "android",
        version_name: name.slice(0, 32),
        version_code: code,
        notes_ko: pickNotes(r.releaseNotes, "ko"),
        notes_en: pickNotes(r.releaseNotes, "en"),
        store_url: `https://play.google.com/store/apps/details?id=${APP_PACKAGE_ID}`,
        rollout_status: r.status ?? null,
        released_at: null,
        source: "play_api",
      });
    }
    return out;
  } finally {
    await fetch(`${base}/edits/${edit.id}`, { method: "DELETE", headers: auth }).catch(() => undefined);
  }
}

/** App Store 공개 조회 — 공개 출시 전이면 빈 배열. */
export async function collectAppStoreRelease(): Promise<CollectedRelease[]> {
  for (const country of ["ph", "us", "kr"]) {
    const res = await fetch(`https://itunes.apple.com/lookup?bundleId=${APP_PACKAGE_ID}&country=${country}`, {
      cache: "no-store",
    });
    const j = (await res.json().catch(() => ({}))) as {
      results?: { version?: string; releaseNotes?: string; currentVersionReleaseDate?: string; trackViewUrl?: string }[];
    };
    const r = j.results?.[0];
    if (r?.version) {
      return [
        {
          platform: "ios",
          version_name: r.version.slice(0, 32),
          version_code: null,
          notes_ko: r.releaseNotes?.trim().slice(0, 4000) || null,
          notes_en: null,
          store_url: r.trackViewUrl ?? null,
          rollout_status: "completed",
          released_at: r.currentVersionReleaseDate ?? null,
          source: "itunes_lookup",
        },
      ];
    }
  }
  return [];
}

/** 기기가 보고한 가장 새 설치 버전 (플랫폼별 1개) — 스토어 키·공개 출시가 없을 때의 자동 기록. */
export async function collectDeviceSeenReleases(sb: SupabaseClient): Promise<CollectedRelease[]> {
  const { data, error } = await sb
    .from("user_devices")
    .select("platform, app_version")
    .in("platform", ["android", "ios"])
    .not("app_version", "is", null)
    .limit(5000);
  if (error) throw new Error(`device_versions_failed:${error.message}`);
  const best = new Map<AppReleasePlatform, { name: string; code: number | null }>();
  for (const row of (data ?? []) as { platform: AppReleasePlatform; app_version: string }[]) {
    const v = parseAppVersionLabel(row.app_version);
    if (!v) continue;
    const cur = best.get(row.platform);
    const newer =
      !cur ||
      compareVersionNames(v.name, cur.name) > 0 ||
      (compareVersionNames(v.name, cur.name) === 0 && (v.code ?? 0) > (cur.code ?? 0));
    if (newer) best.set(row.platform, v);
  }
  return [...best.entries()].map(([platform, v]) => ({
    platform,
    version_name: v.name.slice(0, 32),
    version_code: v.code,
    notes_ko: null,
    notes_en: null,
    store_url: null,
    rollout_status: "completed",
    released_at: null,
    source: "device_seen" as const,
  }));
}
