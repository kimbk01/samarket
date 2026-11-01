/**
 * Google Play 출시 정보 (앱 업데이트 v3) — 서버 전용.
 * 주기 확인 없음: 기기가 처음 보는 새 빌드를 보고할 때만 1번 읽는다(`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` 이 있을 때).
 */
import "server-only";
import { createSign } from "node:crypto";
import type { AppReleasePlatform } from "@/lib/app-releases/app-release-version";

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
