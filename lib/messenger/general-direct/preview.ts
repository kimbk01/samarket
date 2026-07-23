/**
 * general_direct PreviewPort — 메시지 내용만. Domain 판정 없음 / summary·title 금지.
 */
import type { DomainPreview } from "@/lib/messenger/contracts/ports";

export type GeneralDirectPreviewMessage = Readonly<{
  content: string | null | undefined;
  messageType: string | null | undefined;
  isSystemAllowed?: boolean;
}>;

const FORBIDDEN_PREVIEW_MARKERS = [
  "📋 주문 요약",
  "주문 요약",
  "order summary",
  "상품 요약",
] as const;

export function resolveGeneralDirectPreview(message: GeneralDirectPreviewMessage | null | undefined): DomainPreview {
  if (!message) return { text: "", source: "empty" };
  const type = (message.messageType ?? "text").trim();
  const content = (message.content ?? "").trim();

  for (const marker of FORBIDDEN_PREVIEW_MARKERS) {
    if (content.includes(marker)) {
      throw new Error("dibay_general_direct_preview_summary_forbidden");
    }
  }

  if (type === "image") return { text: "사진", source: "latest_user_message" };
  if (type === "voice") return { text: "음성 메시지", source: "latest_user_message" };
  if (type === "file") return { text: content || "파일", source: "latest_user_message" };
  if (type === "system") {
    if (message.isSystemAllowed === false) return { text: "", source: "empty" };
    return { text: content || "", source: content ? "allowed_system_message" : "empty" };
  }
  if (!content) return { text: "", source: "empty" };
  return { text: content, source: "latest_user_message" };
}

/** room.title / headline / order summary 를 preview 소스로 쓰면 거부 */
export function assertGeneralDirectPreviewDoesNotUseMetadata(input: {
  headline?: string | null;
  orderSummary?: string | null;
  productSummary?: string | null;
}): void {
  if (input.headline?.trim() || input.orderSummary?.trim() || input.productSummary?.trim()) {
    throw new Error("dibay_general_direct_preview_metadata_forbidden");
  }
}
