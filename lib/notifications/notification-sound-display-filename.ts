type SoundAssetLike = {
  label?: string | null;
  kind?: string | null;
  file_url?: string | null;
  file_path?: string | null;
};

function basenameFromUrlOrPath(urlOrPath: string): string {
  const trimmed = urlOrPath.trim();
  if (!trimmed) return "";
  try {
    const path = trimmed.includes("://") ? new URL(trimmed).pathname : trimmed;
    const last = path.split("/").pop() ?? trimmed;
    return decodeURIComponent(last.split("?")[0] ?? last);
  } catch {
    return trimmed.split("/").pop()?.split("?")[0] ?? trimmed;
  }
}

/** Admin UI — URL 대신 파일명·라벨만 표시 */
export function displayNotificationSoundAssetLabel(
  asset: SoundAssetLike | undefined,
  fallback: string
): string {
  if (!asset) return fallback;
  const label = asset.label?.trim();
  if (label && !/^https?:\/\//i.test(label)) return label;
  const url = asset.file_url ?? asset.file_path;
  if (url?.trim()) return basenameFromUrlOrPath(url) || fallback;
  return label || fallback;
}

export function displayNotificationSoundUrlFilename(
  url: string | null | undefined,
  noneLabel: string
): string {
  if (!url?.trim()) return noneLabel;
  return basenameFromUrlOrPath(url) || noneLabel;
}
