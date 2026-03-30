import { chatProductSummaryFromPostRow } from "@/lib/chats/chat-product-from-post";
import type { ChatRoom, GeneralChatMeta } from "@/lib/types/chat";

function philifeProductSummary(post: Record<string, unknown> | null | undefined, postId: string, fallbackTitle: string) {
  const base = post
    ? chatProductSummaryFromPostRow(post, postId)
    : chatProductSummaryFromPostRow(
        { title: fallbackTitle, status: "active", region_label: "" } as Record<string, unknown>,
        postId || fallbackTitle
      );
  return {
    ...base,
    detailHref: postId ? `/philife/${postId}` : undefined,
  };
}

type PhilifeListRoomArgs = {
  id: string;
  roomKind: "meeting" | "direct" | "open_chat";
  title: string;
  subtitle: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  relatedPostId?: string | null;
  relatedCommentId?: string | null;
  relatedGroupId?: string | null;
  contextType?: string | null;
  postRow?: Record<string, unknown> | null;
  memberCount?: number;
  joined?: boolean;
  canSend?: boolean;
  canManage?: boolean;
  hostUserId?: string | null;
  partnerIdFallback?: string;
};

export function buildPhilifeListRoom(args: PhilifeListRoomArgs): ChatRoom {
  const postId = (args.relatedPostId ?? "").trim();
  const generalChat: GeneralChatMeta = {
    kind:
      args.roomKind === "meeting"
        ? "group"
        : args.roomKind === "open_chat"
          ? "open_chat"
          : "community",
    relatedPostId: args.relatedPostId ?? null,
    relatedCommentId: args.relatedCommentId ?? null,
    relatedGroupId: args.relatedGroupId ?? null,
    relatedBusinessId: null,
    contextType:
      args.contextType ??
      (args.roomKind === "meeting"
        ? "meeting"
        : args.roomKind === "open_chat"
          ? "open_chat"
          : "community"),
  };

  return {
    id: args.id,
    productId: postId || args.id,
    buyerId: args.partnerIdFallback ?? "",
    sellerId: args.hostUserId ?? "",
    partnerNickname: args.title,
    partnerAvatar: "",
    lastMessage: args.lastMessage,
    lastMessageAt: args.lastMessageAt,
    unreadCount: args.unreadCount,
    product: philifeProductSummary(args.postRow, postId, args.title),
    source: "chat_room",
    tradeStatus: undefined,
    generalChat,
    chatDomain: "philife",
    roomTitle: args.title,
    roomSubtitle: args.subtitle,
    philifeChat: {
      kind: args.roomKind,
      meetingId: args.roomKind === "direct" ? null : (args.relatedGroupId ?? null),
      hostUserId: args.hostUserId ?? null,
      relatedPostId: args.relatedPostId ?? null,
      memberCount: args.memberCount,
      joined: args.joined,
      canSend: args.canSend,
    },
    memberCount: args.memberCount,
    canSend: args.canSend,
    canManage: args.canManage,
    buyerReviewSubmitted: false,
    productChatRoomId: null,
    tradeFlowStatus: undefined,
    chatMode: args.canSend === false ? "readonly" : "open",
    soldBuyerId: null,
    reservedBuyerId: null,
    buyerConfirmSource: null,
  };
}

type PhilifeDetailRoomArgs = PhilifeListRoomArgs & {
  buyerId?: string | null;
  sellerId?: string | null;
};

export function buildPhilifeDetailRoom(args: PhilifeDetailRoomArgs): ChatRoom {
  const row = buildPhilifeListRoom(args);
  return {
    ...row,
    buyerId: args.buyerId ?? row.buyerId,
    sellerId: args.sellerId ?? row.sellerId,
  };
}
