/**
 * 거래 채팅 전용 목록 행 — `CommunityMessengerRoomSummary` → 표시용 필드만 파생.
 *
 * 부트스트랩은 `contextMeta` 객체를 채우지만 DB `summary` 컬럼이 비어 있거나 예전 텍스트만 있을 수 있다.
 * 파싱 소스는 **`contextMeta`가 있으면 그걸 직렬화한 JSON**을 우선한다.
 *
 * 제품 정의·원인·폴백 순서: `docs/community-messenger-trade-chat-list.md`
 */
import {
  parseCommunityMessengerRoomContextMeta,
  serializeCommunityMessengerRoomContextMeta,
} from "@/lib/community-messenger/room-context-meta";
import { resolvePostImagePublicUrl } from "@/lib/posts/resolve-post-image-public-url";
import type {
  CommunityMessengerMessage,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";

export type TradeChatListRowModel = {
  productTitle: string;
  productPriceText: string | null;
  productThumbnailUrl: string | null;
  productStatusText: string | null;
  peerName: string;
  /** 썸네일 경로가 비었을 때 `/api/community-messenger/trade-post-thumbnail` 폴백용 */
  postId: string | null;
};

export function resolveTradeChatListThumbnailDisplayUrl(raw: string | null | undefined): string | null {
  const resolved = resolvePostImagePublicUrl(raw);
  const t = resolved.trim();
  return t.length > 0 ? t : null;
}

function looseSkimTradeSummaryJson(raw: string | null | undefined): {
  headline?: string;
  priceLabel?: string;
  itemStateLabel?: string;
  thumbnailCandidate?: string;
  postId?: string;
} {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s || s[0] !== "{") return {};
  try {
    const o = JSON.parse(s) as Record<string, unknown>;
    const headline = typeof o.headline === "string" && o.headline.trim() ? o.headline.trim() : undefined;
    const priceLabel = typeof o.priceLabel === "string" && o.priceLabel.trim() ? o.priceLabel.trim() : undefined;
    const itemStateLabel = typeof o.itemStateLabel === "string" && o.itemStateLabel.trim() ? o.itemStateLabel.trim() : undefined;
    const postId = typeof o.postId === "string" && o.postId.trim() ? o.postId.trim() : undefined;
    let thumbnailCandidate: string | undefined;
    if (typeof o.thumbnailUrl === "string" && o.thumbnailUrl.trim()) {
      thumbnailCandidate = o.thumbnailUrl.trim();
    } else if (typeof o.thumbnail_url === "string" && o.thumbnail_url.trim()) {
      thumbnailCandidate = o.thumbnail_url.trim();
    } else if (Array.isArray(o.images) && o.images.length > 0) {
      const x = o.images[0];
      if (typeof x === "string" && x.trim()) thumbnailCandidate = x.trim();
      else if (x && typeof x === "object" && "url" in x && typeof (x as { url: unknown }).url === "string") {
        thumbnailCandidate = String((x as { url: string }).url).trim();
      }
    }
    return { headline, priceLabel, itemStateLabel, thumbnailCandidate, postId };
  } catch {
    return {};
  }
}

function tradeListParseSource(room: CommunityMessengerRoomSummary): string {
  const sum = typeof room.summary === "string" ? room.summary.trim() : "";
  const meta = room.contextMeta;
  if (meta && (meta.kind === "trade" || meta.kind === "delivery")) {
    return serializeCommunityMessengerRoomContextMeta(meta);
  }
  return sum;
}

export function buildTradeChatListRowModel(room: CommunityMessengerRoomSummary): TradeChatListRowModel {
  const parseSource = tradeListParseSource(room);
  const parsedStrict = parseCommunityMessengerRoomContextMeta(parseSource);
  const loose = looseSkimTradeSummaryJson(parseSource);
  const ctx = room.contextMeta?.kind === "trade" ? room.contextMeta : null;
  const par = parsedStrict?.kind === "trade" ? parsedStrict : null;

  const peerName = room.title.trim() || "상대";
  const productTitle =
    ctx?.headline?.trim() ||
    par?.headline?.trim() ||
    loose.headline?.trim() ||
    `${peerName}님과 거래`;
  const productPriceText =
    ctx?.priceLabel?.trim() || par?.priceLabel?.trim() || loose.priceLabel?.trim() || null;
  const productStatusText =
    ctx?.itemStateLabel?.trim() || par?.itemStateLabel?.trim() || loose.itemStateLabel?.trim() || null;

  const thumbCandidates = [ctx?.thumbnailUrl, par?.thumbnailUrl, loose.thumbnailCandidate];
  let thumb: string | null = null;
  for (const c of thumbCandidates) {
    const resolved = resolveTradeChatListThumbnailDisplayUrl(typeof c === "string" ? c : null);
    if (resolved) {
      thumb = resolved;
      break;
    }
  }

  const postId =
    ctx?.postId?.trim() || par?.postId?.trim() || loose.postId?.trim() || null;

  return {
    productTitle,
    productPriceText,
    productThumbnailUrl: thumb,
    productStatusText,
    peerName,
    postId,
  };
}

function messengerMessageToPreviewSnippet(msg: CommunityMessengerMessage): string {
  const t = msg.messageType ?? "text";
  const content = (msg.content ?? "").trim();
  if (t === "image") return "사진";
  if (t === "voice") return "음성 메시지";
  if (t === "sticker") return "스티커";
  if (t === "file") return content || "파일";
  if (t === "call_stub") {
    if (!content) return "통화";
    return content.includes("통화") ? content : `통화 · ${content}`;
  }
  if (t === "system") return content || "알림";
  return content || "새 메시지";
}

export function buildTradeChatListPreviewLine(args: {
  listPreview: string;
  peerName: string;
  lastClientMessage: CommunityMessengerMessage | null | undefined;
}): string {
  const msg = args.lastClientMessage;
  if (!msg) return args.listPreview;
  const snippet = messengerMessageToPreviewSnippet(msg);
  const who = msg.isMine ? "나" : args.peerName.trim() || "상대";
  return `${who}: ${snippet}`;
}
