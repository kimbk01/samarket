/**
 * WP-5 / IMG-01 — 메신저 메시지 삭제 시 스토리지 미디어를 함께 purge.
 *
 * 기존 삭제 경로는 voice 만 remove 하고 image/file 은 스토리지에 남겼다(IMG-01).
 * 또 remove 를 DB 갱신보다 먼저 호출해, DB 갱신이 실패해도 파일이 이미 삭제되는 순서 문제가 있었다.
 *
 * 이 헬퍼는 메시지 행의 **서버측 metadata** 에서만 경로를 모은다(클라이언트 입력 아님 — WP-2 로
 * anon/authenticated 직접 쓰기가 막혀 metadata 는 service_role 만 기록).
 * 호출 순서 계약: **DB 갱신 성공 → purgeMessengerMediaStoragePaths**. 실패 경로는 로그만 남긴다.
 */

const POST_IMAGES_PUBLIC_KEY = "/storage/v1/object/public/post-images/";

/** post-images 공개 URL → 스토리지 키. 레거시 메시지(콘텐츠에 공개 URL) 대응. */
export function postImagesPathFromPublicUrl(url: string | null | undefined): string | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const i = u.pathname.indexOf(POST_IMAGES_PUBLIC_KEY);
    if (i === -1) return null;
    return decodeURIComponent(u.pathname.slice(i + POST_IMAGES_PUBLIC_KEY.length));
  } catch {
    return null;
  }
}

/** post-images 버킷 내부 키로서 안전한지(비어있지 않고, 스킴/호스트·상위경로 탈출 없음). */
function isSafePostImagesPath(path: string): boolean {
  const p = path.trim();
  if (!p) return false;
  if (p.includes("://")) return false; // 공개 URL 통째로가 아니라 버킷 키여야 함
  if (p.startsWith("/")) return false;
  if (p.split("/").some((seg) => seg === "..")) return false; // 경로 탈출 금지
  return true;
}

/**
 * 메시지 행의 metadata/content 에서 purge 대상 post-images 키를 모은다.
 * - metadata.storage_paths: string[] (이미지 번들)
 * - metadata.storagePath: string (단일 이미지/파일/보이스)
 * - content 의 레거시 공개 URL
 * - 같은 키의 파생 형제(.thumb / .preview) best-effort (없으면 remove no-op)
 */
export function collectMessengerMediaStoragePaths(input: {
  metadata?: Record<string, unknown> | null;
  content?: string | null;
}): string[] {
  const out = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v !== "string") return;
    const t = v.trim();
    if (t && isSafePostImagesPath(t)) out.add(t);
  };

  const meta = input.metadata ?? {};
  const arr = (meta as { storage_paths?: unknown }).storage_paths;
  if (Array.isArray(arr)) for (const p of arr) add(p);
  add((meta as { storagePath?: unknown }).storagePath);

  const legacy = postImagesPathFromPublicUrl(input.content ?? "");
  if (legacy && isSafePostImagesPath(legacy)) out.add(legacy);

  // 파생 형제 — 원본 키가 확정된 경우에만. 없는 키 remove 는 무해(no-op).
  for (const base of [...out]) {
    out.add(`${base}.thumb`);
    out.add(`${base}.preview`);
  }
  return [...out];
}

type MinimalStorageClient = {
  storage: {
    from: (bucket: string) => {
      remove: (paths: string[]) => Promise<{ error: { message?: string } | null }>;
    };
  };
};

/**
 * 모은 키를 post-images 에서 제거한다. **DB 갱신이 성공한 뒤** 호출할 것.
 * 반환: 요청 수. 실패는 throw 하지 않고 로그만 남긴다(삭제 자체는 이미 DB 상 완료).
 */
export async function purgeMessengerMediaStoragePaths(
  sb: MinimalStorageClient,
  paths: string[],
  ctx?: { messageId?: string; roomId?: string }
): Promise<{ requested: number }> {
  const unique = [...new Set(paths.filter((p) => isSafePostImagesPath(p)))];
  if (unique.length === 0) return { requested: 0 };
  try {
    const { error } = await sb.storage.from("post-images").remove(unique);
    if (error) {
      console.error("[messenger-media-purge] remove_failed", {
        ...ctx,
        paths: unique,
        error: error.message ?? String(error),
      });
    }
  } catch (err) {
    console.error("[messenger-media-purge] remove_threw", {
      ...ctx,
      paths: unique,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return { requested: unique.length };
}
