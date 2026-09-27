import {
  INTRO_ASSET_KINDS,
  INTRO_DECODE_STATUSES,
  isIn,
  type ContractResult,
  type IntroAssetKind,
  type IntroDecodeStatus,
} from "@/lib/startup/intro-v2/types";

export type IntroAssetContract = {
  kind: IntroAssetKind;
  storagePath: string;
  publicUrl: string | null;
  mime: string | null;
  bytes: number | null;
  sha256: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  loop: boolean;
  posterAssetId: string | null;
  decodeStatus: IntroDecodeStatus;
};

function forbiddenRef(value: string): boolean {
  const t = value.trim().toLowerCase();
  if (t.startsWith("blob:")) return true;
  if (t.startsWith("filesystem:")) return true;
  if (t.includes("localhost")) return true;
  if (t.includes("127.0.0.1")) return true;
  if (t.includes("[::1]")) return true;
  if (t.startsWith("http://")) return true;
  return false;
}

export function validateIntroAssetRef(raw: unknown): ContractResult<IntroAssetContract> {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "asset_not_object" };
  }
  const rec = raw as Record<string, unknown>;
  if (!isIn(INTRO_ASSET_KINDS, rec.kind)) return { ok: false, error: "asset_kind_invalid" };
  const storagePath = String(rec.storagePath ?? rec.storage_path ?? "").trim();
  if (!storagePath) return { ok: false, error: "storage_path_required" };
  if (forbiddenRef(storagePath)) return { ok: false, error: "persistable_ref_required" };
  const publicUrlRaw = rec.publicUrl ?? rec.public_url ?? rec.canonicalRef ?? null;
  const publicUrl = publicUrlRaw == null || publicUrlRaw === "" ? null : String(publicUrlRaw).trim();
  if (publicUrl) {
    if (forbiddenRef(publicUrl)) return { ok: false, error: "persistable_ref_required" };
    if (!publicUrl.startsWith("https://") && !publicUrl.startsWith("/")) {
      return { ok: false, error: "persistable_ref_required" };
    }
  }
  const bytes = rec.bytes == null ? null : Number(rec.bytes);
  if (bytes != null && (!Number.isInteger(bytes) || bytes < 0)) return { ok: false, error: "bytes_invalid" };
  const sha256 = rec.sha256 == null || rec.sha256 === "" ? null : String(rec.sha256);
  if (sha256 && !/^[0-9a-f]{64}$/i.test(sha256)) return { ok: false, error: "sha256_invalid" };
  const decodeStatus = isIn(INTRO_DECODE_STATUSES, rec.decodeStatus)
    ? rec.decodeStatus
    : "pending";
  return {
    ok: true,
    value: {
      kind: rec.kind,
      storagePath,
      publicUrl,
      mime: rec.mime == null ? null : String(rec.mime),
      bytes,
      sha256,
      width: rec.width == null ? null : Number(rec.width),
      height: rec.height == null ? null : Number(rec.height),
      durationMs: rec.durationMs == null ? null : Number(rec.durationMs),
      loop: rec.loop === true,
      posterAssetId: rec.posterAssetId == null ? null : String(rec.posterAssetId),
      decodeStatus,
    },
  };
}
