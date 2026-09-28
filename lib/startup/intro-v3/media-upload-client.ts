import type { IntroV3LibrarySelection, IntroV3MediaDerivative, IntroV3MediaSource } from "@/lib/startup/intro-v3/media-types";
import { isIntroV3PersistableRef } from "@/lib/startup/intro-v3/persistable";

export type IntroV3ReadyCatalogItem = {
  source: IntroV3MediaSource;
  derivative: IntroV3MediaDerivative;
};

export function introV3CatalogToken(item: IntroV3ReadyCatalogItem): string {
  return `${item.source.id}:${item.derivative.id}`;
}

export function introV3CatalogPublicUrl(item: IntroV3ReadyCatalogItem): string | null {
  const url = item.derivative.publicUrl?.trim() || null;
  if (!url || !isIntroV3PersistableRef(url)) return null;
  return url;
}

export function introV3CatalogDimensionsLabel(item: IntroV3ReadyCatalogItem): string {
  const width = item.derivative.width;
  const height = item.derivative.height;
  if (!(width > 0) || !(height > 0)) return "";
  return `${width} × ${height}`;
}

export function selectionFromCatalogItem(
  item: IntroV3ReadyCatalogItem,
  intent: IntroV3LibrarySelection["intent"]
): IntroV3LibrarySelection | null {
  if (item.source.status !== "ready" || item.derivative.status !== "ready") return null;
  if (!introV3CatalogPublicUrl(item) && !isIntroV3PersistableRef(item.derivative.storagePath)) return null;
  return {
    intent,
    mediaRef: { sourceId: item.source.id, derivativeId: item.derivative.id },
    source: item.source,
    derivative: item.derivative,
  };
}

export async function fetchIntroV3ReadyMediaCatalog(): Promise<IntroV3ReadyCatalogItem[]> {
  const res = await fetch("/api/admin/intro-v3/media", { credentials: "same-origin" });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    items?: IntroV3ReadyCatalogItem[];
  };
  if (!res.ok || !json.ok || !Array.isArray(json.items)) return [];
  return json.items.filter((item) => introV3CatalogPublicUrl(item) || isIntroV3PersistableRef(item.derivative.storagePath));
}

export async function uploadAndProcessIntroV3Still(
  file: File,
  options?: { signal?: AbortSignal }
): Promise<
  | { ok: true; item: IntroV3ReadyCatalogItem }
  | { ok: false; error: string; cancelled?: boolean }
> {
  const signal = options?.signal;
  try {
    const signedRes = await fetch("/api/admin/intro-v3/media/sign", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        filename: file.name,
        mime: file.type,
        bytes: file.size,
      }),
    });
    const signed = (await signedRes.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      signedUrl?: string;
      sourceId?: string;
    };
    if (signal?.aborted) return { ok: false, error: "cancelled", cancelled: true };
    if (!signedRes.ok || !signed.ok || !signed.signedUrl || !signed.sourceId) {
      return { ok: false, error: String(signed.error || "network_upload_failed") };
    }
    const put = await fetch(signed.signedUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "true",
      },
      body: file,
      signal,
    });
    if (signal?.aborted) return { ok: false, error: "cancelled", cancelled: true };
    if (!put.ok) return { ok: false, error: "network_upload_failed" };
    const processRes = await fetch("/api/admin/intro-v3/media/process", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({ sourceId: signed.sourceId }),
    });
    const processed = (await processRes.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      source?: IntroV3MediaSource;
      derivative?: IntroV3MediaDerivative;
    };
    if (signal?.aborted) return { ok: false, error: "cancelled", cancelled: true };
    if (!processRes.ok || !processed.ok || !processed.source || !processed.derivative) {
      return { ok: false, error: String(processed.error || "processing_failed") };
    }
    if (processed.source.status !== "ready" || processed.derivative.status !== "ready") {
      return { ok: false, error: "processing_failed" };
    }
    return { ok: true, item: { source: processed.source, derivative: processed.derivative } };
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      return { ok: false, error: "cancelled", cancelled: true };
    }
    return { ok: false, error: "network_upload_failed" };
  }
}
