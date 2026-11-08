/**
 * 언어 SSOT B3 — 도메인 목록(거래·주문·1:1·그룹) 미리보기의 저장 시스템 문장을 보는 사람 언어로 다시 그린다.
 * 메시지 행 `metadata` 로 만든 메타(`cmRoomLastMessageMetaFromMessage`)가 있고 그 `text` 가 저장 글자 첫 줄과 같을 때만 쓴다.
 * 메타가 없거나 맞지 않으면 null — 호출자는 지금과 똑같이 저장 글자를 쓴다.
 * 주문 요약(`store_order_summary`)은 도메인 목록 정책(주문 요약 미리보기 금지·가림)을 그대로 따르도록 다루지 않는다.
 */
import { translateCmUi } from "@/lib/community-messenger/cm-ui-translate";
import {
  cmSystemFirstLine,
  resolveCmSystemListPreview,
  type CmRoomLastMessageMeta,
  type CmSystemTranslate,
} from "@/lib/community-messenger/system-message-i18n";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/messages";

/** 서버 조립(요청 언어)은 lang 을 넘긴다. 없으면 클라이언트 런타임 언어(`translateCmUi`) */
export function domainListSystemTranslate(lang?: AppLanguageCode | null): CmSystemTranslate {
  return lang ? (key, vars) => translate(lang, key, vars) : translateCmUi;
}

export function resolveDomainListSystemPreviewText(
  input: { lastMessage: string | null | undefined; meta: CmRoomLastMessageMeta | null | undefined },
  lang?: AppLanguageCode | null
): string | null {
  const meta = input.meta;
  if (!meta || typeof meta.text !== "string") return null;
  if (meta.kind === "store_order_summary") return null;
  const first = cmSystemFirstLine(input.lastMessage);
  if (!first || meta.text.trim() !== first) return null;
  return resolveCmSystemListPreview(
    { lastMessage: input.lastMessage, meta },
    domainListSystemTranslate(lang)
  );
}
