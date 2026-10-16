/**
 * Community post detail — which links may become an in-post video player (pure; unit-tested).
 *
 * SECURITY CONTRACT:
 * - No HTML or script from a post is ever executed. A post body only ever yields a provider + id
 *   (YouTube / Vimeo, strictly validated) or an http(s) media-file URL; the player URL is rebuilt
 *   here from that id. Anything else stays plain text.
 * - Allowed embed hosts: www.youtube-nocookie.com/embed, player.vimeo.com/video. Nothing else is iframed.
 * - Stored content is never rewritten; detection happens at render time, so old and new posts behave the same.
 */

export type PostVideo =
  | {
      provider: "youtube";
      id: string;
      short: boolean;
      embedSrc: string;
      watchUrl: string;
      thumbnailUrl: string;
    }
  | { provider: "vimeo"; id: string; embedSrc: string; watchUrl: string; thumbnailUrl: null }
  | { provider: "file"; src: string; watchUrl: string; thumbnailUrl: null };

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);
const YT_ID = /^[\w-]{11}$/;
const VIMEO_ID = /^\d{4,12}$/;
const VIDEO_FILE_EXT = /\.(mp4|m4v|webm|mov)$/i;

function parseHttpUrl(raw: string): URL | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  try {
    const u = new URL(s.startsWith("//") ? `https:${s}` : s);
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

function youtube(id: string, short: boolean): PostVideo {
  return {
    provider: "youtube",
    id,
    short,
    embedSrc: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0`,
    watchUrl: short ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
}

/** A URL → the video it plays, or null when it is not an allowed video link. */
export function parsePostVideoUrl(raw: string): PostVideo | null {
  const u = parseHttpUrl(raw);
  if (!u) return null;
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") {
    const id = parts[0] ?? "";
    return YT_ID.test(id) ? youtube(id, false) : null;
  }
  if (YOUTUBE_HOSTS.has(host)) {
    if (parts[0] === "watch") {
      const id = u.searchParams.get("v") ?? "";
      return YT_ID.test(id) ? youtube(id, false) : null;
    }
    if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "v" || parts[0] === "live") {
      const id = parts[1] ?? "";
      return YT_ID.test(id) ? youtube(id, parts[0] === "shorts") : null;
    }
    return null;
  }
  if (VIMEO_HOSTS.has(host)) {
    const id = host === "player.vimeo.com" ? (parts[0] === "video" ? parts[1] : "") : parts[0];
    if (!id || !VIMEO_ID.test(id)) return null;
    return {
      provider: "vimeo",
      id,
      embedSrc: `https://player.vimeo.com/video/${id}?autoplay=1&playsinline=1`,
      watchUrl: `https://vimeo.com/${id}`,
      thumbnailUrl: null,
    };
  }
  if (VIDEO_FILE_EXT.test(u.pathname)) {
    return { provider: "file", src: u.toString(), watchUrl: u.toString(), thumbnailUrl: null };
  }
  return null;
}

export type PostTextSegment = { kind: "text"; text: string } | { kind: "video"; video: PostVideo; label: string };

const URL_IN_TEXT = /(?:https?:)?\/\/[^\s<>"'`]+/gi;
/** A line becomes a player only when it is the video link alone or with a short label (e.g. "▶ YouTube 영상 보기"). */
const MAX_LABEL_CHARS = 40;

/**
 * Body text → text runs and standalone video lines. A video URL inside a sentence stays text, so
 * nobody's prose is rearranged; joining all text segments back gives the original lines.
 */
export function splitPostTextWithVideos(text: string): PostTextSegment[] {
  if (!text) return [];
  const out: PostTextSegment[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length) out.push({ kind: "text", text: buf.join("\n") });
    buf = [];
  };
  for (const line of text.split("\n")) {
    const urls = line.match(URL_IN_TEXT) ?? [];
    const video = urls.length === 1 ? parsePostVideoUrl(urls[0]!.replace(/[.,)\]]+$/, "")) : null;
    const label = video ? line.replace(urls[0]!, "").replace(/\s+/g, " ").trim() : "";
    if (video && label.length <= MAX_LABEL_CHARS) {
      flush();
      out.push({ kind: "video", video, label });
    } else {
      buf.push(line);
    }
  }
  flush();
  // Trim the blank lines that sat around a lifted-out video line.
  return out
    .map((s) => (s.kind === "text" ? { ...s, text: s.text.replace(/^\n+|\n+$/g, "") } : s))
    .filter((s) => s.kind === "video" || s.text.trim() !== "");
}

export function hasPostVideo(text: string): boolean {
  return splitPostTextWithVideos(text).some((s) => s.kind === "video");
}

/**
 * The import pipeline keeps a video as "thumbnail image + ▶ label link" (see operator-import
 * normalize `preserveVideoEmbeds`). Once the link plays in place that thumbnail copy is a duplicate.
 */
export function isImportedVideoLabel(label: string): boolean {
  return label.trim().startsWith("▶");
}

/**
 * Viewer "원본": Supabase image-transform URLs → the stored original object. Other URLs are already original.
 */
export function originalImageUrl(url: string): string {
  const u = parseHttpUrl(url);
  if (!u) return url;
  if (u.pathname.includes("/storage/v1/render/image/public/")) {
    u.pathname = u.pathname.replace("/storage/v1/render/image/public/", "/storage/v1/object/public/");
    u.search = "";
    return u.toString();
  }
  return url;
}
