import { describe, expect, it } from "vitest";
import { GROUP_CHAT_API_ERROR_CODE_MAP } from "@/lib/group-chat/group-chat-error-text";
import { resolveApiErrorText } from "@/lib/i18n/api-error-text";
import { translate, type MessageKey } from "@/lib/i18n/messages";

const HANGUL = /[가-힣]/;
const tFor = (lang: "ko" | "en") => (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);

describe("그룹채팅 오류 코드 → 문구 (언어 재감사 2026-11-27)", () => {
  it("모든 코드가 카탈로그 키로 이어지고 en 결과에 한글 0", () => {
    for (const code of Object.keys(GROUP_CHAT_API_ERROR_CODE_MAP)) {
      const en = resolveApiErrorText({
        code,
        map: GROUP_CHAT_API_ERROR_CODE_MAP,
        fallbackKey: "common_chat_room_load_failed",
        t: tFor("en"),
      });
      expect(en, code).not.toMatch(HANGUL);
      expect(en, code).not.toBe(code);
      const ko = resolveApiErrorText({
        code,
        map: GROUP_CHAT_API_ERROR_CODE_MAP,
        fallbackKey: "common_chat_room_load_failed",
        t: tFor("ko"),
      });
      expect(ko, code).toMatch(HANGUL);
    }
  });

  it("서버 문장(옛 응답)은 화면에 내보내지 않는다", () => {
    const text = resolveApiErrorText({
      json: { ok: false, error: "멤버만 볼 수 있습니다." },
      status: 403,
      map: GROUP_CHAT_API_ERROR_CODE_MAP,
      fallbackKey: "common_chat_room_load_failed",
      t: tFor("en"),
    });
    expect(text).not.toMatch(HANGUL);
    const dbText = resolveApiErrorText({
      json: { ok: false, error: "duplicate key value violates unique constraint" },
      status: 500,
      map: GROUP_CHAT_API_ERROR_CODE_MAP,
      fallbackKey: "common_chat_room_load_failed",
      t: tFor("ko"),
    });
    expect(dbText).not.toMatch(/duplicate key/);
  });
});
