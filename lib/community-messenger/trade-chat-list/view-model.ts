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
import {
  DEFAULT_TRADE_CHAT_CATEGORY_MENU_LABEL,
  defaultTradeChatCategoryMenuLabel,
} from "@/lib/community-messenger/trade-chat-list/category-menu-label";
import type {
  CommunityMessengerMessage,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import type { MessageKey } from "@/lib/i18n/messages";

let tradeChatListDevMissingPostIdWarned = false;
let tradeChatListDebugInfoOnce = false;

export type TradeChatListTranslate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export type TradeChatListRowModel = {
  /** 1행 칩 — 대메뉴 5분류 `categoryMenuLabel` 단일 소스(부트스트랩 enrich) */
  categoryChipLabel: string;
  productTitle: string;
  productPriceText: string | null;
  productThumbnailUrl: string | null;
  productStatusText: string | null;
  peerName: string;
  /** 썸네일 경로가 비었을 때 `/api/community-messenger/trade-post-thumbnail` 폴백용 */
  postId: string | null;
  /** 4행 — `contextMeta.sellerDisplayName` + 「판매자:」/「일자리」일 때 「작성자:」 */
  listingOwnerLine: string | null;
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
  categoryMenuLabel?: string;
  productCategoryLabel?: string;
  thumbnailCandidate?: string;
  postId?: string;
  sellerDisplayName?: string;
} {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s || s[0] !== "{") return {};
  try {
    const o = JSON.parse(s) as Record<string, unknown>;
    const headline = typeof o.headline === "string" && o.headline.trim() ? o.headline.trim() : undefined;
    const priceLabel = typeof o.priceLabel === "string" && o.priceLabel.trim() ? o.priceLabel.trim() : undefined;
    const itemStateLabel = typeof o.itemStateLabel === "string" && o.itemStateLabel.trim() ? o.itemStateLabel.trim() : undefined;
    const categoryMenuLabel =
      typeof o.categoryMenuLabel === "string" && o.categoryMenuLabel.trim() ? o.categoryMenuLabel.trim() : undefined;
    const productCategoryLabel =
      typeof o.productCategoryLabel === "string" && o.productCategoryLabel.trim() ? o.productCategoryLabel.trim() : undefined;
    const postId = typeof o.postId === "string" && o.postId.trim() ? o.postId.trim() : undefined;
    const sellerDisplayName =
      typeof o.sellerDisplayName === "string" && o.sellerDisplayName.trim() ? o.sellerDisplayName.trim() : undefined;
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
    return {
      headline,
      priceLabel,
      itemStateLabel,
      categoryMenuLabel,
      productCategoryLabel,
      thumbnailCandidate,
      postId,
      sellerDisplayName,
    };
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

export function buildTradeChatListRowModel(
  room: CommunityMessengerRoomSummary,
  t: TradeChatListTranslate
): TradeChatListRowModel {
  const parseSource = tradeListParseSource(room);
  const parsedStrict = parseCommunityMessengerRoomContextMeta(parseSource);
  const loose = looseSkimTradeSummaryJson(parseSource);
  const ctx = room.contextMeta?.kind === "trade" ? room.contextMeta : null;
  const par = parsedStrict?.kind === "trade" ? parsedStrict : null;

  if (typeof process !== "undefined" && process.env.NODE_ENV === "development" && !tradeChatListDebugInfoOnce) {
    tradeChatListDebugInfoOnce = true;
    const m = room.contextMeta?.kind === "trade" ? room.contextMeta : null;
    console.info("[trade-chat-list-debug]", {
      sampleRoomId: room.id,
      postId: m?.postId ?? null,
      headline: m?.headline ?? null,
      categoryMenuLabel: m?.categoryMenuLabel ?? null,
      sellerDisplayName: m?.sellerDisplayName ?? null,
    });
  }

  const peerName = room.title.trim() || t("chats_trade_list_peer_fallback");
  const productTitle =
    ctx?.headline?.trim() ||
    par?.headline?.trim() ||
    loose.headline?.trim() ||
    t("chats_trade_list_no_title");
  const productPriceText =
    ctx?.priceLabel?.trim() || par?.priceLabel?.trim() || loose.priceLabel?.trim() || null;
  const productStatusText =
    ctx?.itemStateLabel?.trim() || par?.itemStateLabel?.trim() || loose.itemStateLabel?.trim() || null;
  const categoryChipLabel =
    ctx?.productCategoryLabel?.trim() ||
    ctx?.categoryMenuLabel?.trim() ||
    par?.categoryMenuLabel?.trim() ||
    loose.categoryMenuLabel?.trim() ||
    defaultTradeChatCategoryMenuLabel(t);

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

  if (typeof process !== "undefined" && process.env.NODE_ENV === "development" && !postId && !tradeChatListDevMissingPostIdWarned) {
    tradeChatListDevMissingPostIdWarned = true;
    console.warn(
      "[trade-chat-list] missing postId on a trade list row — check enrich/summary or critical_patch merge",
      { roomId: room.id, messengerDirectKey: room.messengerDirectKey ?? null }
    );
  }

  const sellerName =
    ctx?.sellerDisplayName?.trim() ||
    par?.sellerDisplayName?.trim() ||
    loose.sellerDisplayName?.trim() ||
    t("chats_trade_list_unknown_seller");
  const jobsCategory = categoryChipLabel === "일자리";
  const listingOwnerLine = `${jobsCategory ? t("chats_trade_list_owner_author") : t("chats_trade_list_owner_seller")}: ${sellerName}`;

  return {
    categoryChipLabel,
    productTitle,
    productPriceText,
    productThumbnailUrl: thumb,
    productStatusText,
    peerName,
    postId,
    listingOwnerLine,
  };
}

function messengerMessageToPreviewSnippet(
  msg: CommunityMessengerMessage,
  t: TradeChatListTranslate
): string {
  const type = msg.messageType ?? "text";
  const content = (msg.content ?? "").trim();
  if (type === "image") return t("cm_ui_photo");
  if (type === "voice") return t("cm_ui_voice_message");
  if (type === "sticker") return t("cm_ui_sticker");
  if (type === "file") return content || t("chats_trade_list_file");
  if (type === "call_stub") {
    if (!content) return t("chats_trade_list_call");
    return content.includes("통화") || content.toLowerCase().includes("call")
      ? content
      : `${t("chats_trade_list_call")} · ${content}`;
  }
  if (type === "system") return content || t("chats_trade_list_notification");
  return content || t("chats_trade_list_new_message");
}

export function buildTradeChatListPreviewLine(args: {
  listPreview: string;
  peerName: string;
  lastClientMessage: CommunityMessengerMessage | null | undefined;
  t: TradeChatListTranslate;
}): string {
  const msg = args.lastClientMessage;
  if (!msg) return args.listPreview;
  const snippet = messengerMessageToPreviewSnippet(msg, args.t);
  const who = msg.isMine ? args.t("chats_trade_list_preview_me") : args.peerName.trim() || args.t("chats_trade_list_peer_fallback");
  return `${who}: ${snippet}`;
}

/** @deprecated 테스트·비-i18n 비교용 */
export { DEFAULT_TRADE_CHAT_CATEGORY_MENU_LABEL };
