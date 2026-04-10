import type {
  PostListBodyBlock,
  PostListPreviewModel,
} from "@/lib/posts/post-list-preview-model";

/** 채팅 목록 본문 — 부동산 1·2단과 동일 타이포 (중고·차·환전·알바 공통) */
export const CHAT_LIST_ROW_LINE_PRIMARY =
  "mt-0 line-clamp-1 text-[12px] font-semibold leading-tight text-gray-900";
export const CHAT_LIST_ROW_LINE_SECONDARY =
  "mt-0 line-clamp-1 text-[11px] leading-tight text-gray-500";

/**
 * 채팅 상단 카드(`ChatProductSummary`): 피드와 동일 본문이되,
 * - 환전 마지막 줄(위치|시간)은 본문에서 제거(하단 region·상대시간과 중복)
 * - `listFooter` 의 ul(지역·시간·채팅수)도 Link 밖 행과 겹치므로 생략하고 **판매자 줄(`sellerLine`)만** 유지
 */
export function trimPreviewForChatHeader(preview: PostListPreviewModel): PostListPreviewModel {
  const bodyBlocks =
    preview.thumbnailMode === "exchange"
      ? preview.bodyBlocks.slice(0, -1)
      : preview.bodyBlocks;
  const lf = preview.listFooter;
  const listFooter =
    lf && (lf.sellerLine?.trim() || lf.items.length > 0)
      ? {
          sellerLine: lf.sellerLine?.trim() ?? null,
          ulClassName: lf.ulClassName,
          items: [],
        }
      : null;
  return {
    ...preview,
    bodyBlocks,
    listFooter,
  };
}

function locationOnlyFromPipeRow(text: string): string {
  const idx = text.indexOf("|");
  return (idx >= 0 ? text.slice(0, idx) : text).trim();
}

/** 부동산: 거래·금액 / 스펙·위치(시간 제외) 두 줄 */
function compactRealEstateChatRow(preview: PostListPreviewModel): PostListPreviewModel {
  const blocks = preview.bodyBlocks;
  const n = blocks.length;
  const dealPart = preview.listingChips.map((c) => c.text).filter(Boolean).join(" · ");
  const priceText = n >= 1 ? blocks[0].text : "";
  let specsText = "";
  let locationText = "";
  if (n >= 3) {
    specsText = blocks[1].text;
    locationText = locationOnlyFromPipeRow(blocks[2].text);
  } else if (n === 2) {
    locationText = locationOnlyFromPipeRow(blocks[1].text);
  }
  const line1 = [dealPart, priceText].filter(Boolean).join(" · ");
  const line2 = [specsText, locationText].filter(Boolean).join(" · ");
  const out: PostListBodyBlock[] = [];
  if (line1) out.push({ className: CHAT_LIST_ROW_LINE_PRIMARY, text: line1 });
  if (line2) out.push({ className: CHAT_LIST_ROW_LINE_SECONDARY, text: line2 });
  return {
    ...preview,
    listingChips: [],
    listingBold: null,
    showPipeAfterListingBadge: false,
    bodyBlocks: out.length > 0 ? out : preview.bodyBlocks,
    listFooter: preview.listFooter,
  };
}

/** 알바: 구인유형·제목·급여 한 줄 + 위치(시간 제외) */
function compactJobsChatRow(preview: PostListPreviewModel): PostListPreviewModel {
  const jobChip = preview.listingChips.map((c) => c.text).filter(Boolean).join(" · ");
  const [b0, b1, b2] = preview.bodyBlocks;
  const title = b0?.text ?? "";
  const pay = b1?.text ?? "";
  const loc = b2?.text ? locationOnlyFromPipeRow(b2.text) : "";
  const line1 = [jobChip, title, pay].filter(Boolean).join(" · ");
  const out: PostListBodyBlock[] = [
    { className: CHAT_LIST_ROW_LINE_PRIMARY, text: line1 || title || "상품" },
  ];
  if (loc) out.push({ className: CHAT_LIST_ROW_LINE_SECONDARY, text: loc });
  return {
    ...preview,
    listingChips: [],
    listingBold: null,
    showPipeAfterListingBadge: false,
    bodyBlocks: out,
    listFooter: preview.listFooter,
  };
}

/** 중고차: 칩·가격 한 줄 + 차종·년식 한 줄 (피드 2·3단과 동일 소스) */
function compactUsedCarChatRow(preview: PostListPreviewModel): PostListPreviewModel {
  const chip = preview.listingChips.map((c) => c.text).filter(Boolean).join(" · ");
  const blocks = preview.bodyBlocks;
  let spec = "";
  let price = preview.listingBold?.trim() ?? "";
  if (blocks.length >= 2) {
    spec = blocks[0]?.text ?? "";
    price = blocks[1]?.text?.trim() ?? price;
  } else if (blocks.length === 1) {
    price = blocks[0]?.text?.trim() ?? price;
  }
  const line1 = [chip, price].filter(Boolean).join(" · ");
  const out: PostListBodyBlock[] = [];
  if (line1) out.push({ className: CHAT_LIST_ROW_LINE_PRIMARY, text: line1 });
  if (spec) out.push({ className: CHAT_LIST_ROW_LINE_SECONDARY, text: spec });
  return {
    ...preview,
    listingChips: [],
    listingBold: null,
    showPipeAfterListingBadge: false,
    bodyBlocks: out.length > 0 ? out : preview.bodyBlocks,
    listFooter: preview.listFooter,
  };
}

/** 환전: 1단 칩(페소 팝니다 등)·페소액 / 환율 (피드: 제목은 칩, 본문은 금액→환율→메타) */
function compactExchangeChatRow(preview: PostListPreviewModel): PostListPreviewModel {
  const chipPart = preview.listingChips.map((c) => c.text).filter(Boolean).join(" · ");
  const [b0, b1] = preview.bodyBlocks;
  const php = b0?.text ?? "";
  const rate = b1?.text ?? "";
  const line1 = [chipPart, php].filter(Boolean).join(" · ");
  const out: PostListBodyBlock[] = [];
  if (line1) out.push({ className: CHAT_LIST_ROW_LINE_PRIMARY, text: line1 });
  if (rate) out.push({ className: CHAT_LIST_ROW_LINE_SECONDARY, text: rate });
  return {
    ...preview,
    listingChips: [],
    listingBold: null,
    showPipeAfterListingBadge: false,
    bodyBlocks: out.length > 0 ? out : preview.bodyBlocks,
    listFooter: preview.listFooter,
  };
}

/** 일반 거래: 칩·제목·가격 한 줄 (listingBold 없음 — 제목+가격만 body) */
function compactTradeChatRow(preview: PostListPreviewModel): PostListPreviewModel {
  const chipPart = preview.listingChips.map((c) => c.text).filter(Boolean).join(" · ");
  const title = preview.bodyBlocks[0]?.text ?? "";
  const price = preview.bodyBlocks[1]?.text ?? "";
  const line1 = [chipPart, title, price].filter(Boolean).join(" · ");
  const out: PostListBodyBlock[] = [];
  if (line1) out.push({ className: CHAT_LIST_ROW_LINE_PRIMARY, text: line1 });
  return {
    ...preview,
    listingChips: [],
    listingBold: null,
    showPipeAfterListingBadge: false,
    bodyBlocks: out.length > 0 ? out : preview.bodyBlocks,
    listFooter: preview.listFooter,
  };
}

/**
 * 채팅 목록 줄: 행 높이를 맞추기 위해 상품 요약을 1~2줄로 압축 (부동산·알바·중고차·일반거래)
 *
 * `trimPreviewForChatHeader` 를 쓰지 않음 — 그 함수는 상단 카드용으로 `listFooter` ul 을 비우므로,
 * 목록 행에서는 피드와 동일하게 **판매자·지역·시간** 푸터를 유지한다.
 */
export function trimPreviewForChatRoomRow(preview: PostListPreviewModel): PostListPreviewModel {
  const sliced =
    preview.thumbnailMode === "exchange"
      ? { ...preview, bodyBlocks: preview.bodyBlocks.slice(0, -1) }
      : preview;
  const kind = sliced.listKind;

  if (kind === "real-estate") return compactRealEstateChatRow(sliced);
  if (kind === "jobs") return compactJobsChatRow(sliced);
  if (kind === "used-car") return compactUsedCarChatRow(sliced);
  if (kind === "exchange") return compactExchangeChatRow(sliced);
  if (kind === "trade") return compactTradeChatRow(sliced);

  return {
    ...sliced,
    bodyBlocks: sliced.bodyBlocks.map((b, i) => ({
      ...b,
      className: i === 0 ? CHAT_LIST_ROW_LINE_PRIMARY : CHAT_LIST_ROW_LINE_SECONDARY,
    })),
  };
}
