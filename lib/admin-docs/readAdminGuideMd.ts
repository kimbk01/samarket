import fs from "node:fs";
import path from "node:path";
import { ADMIN_GUIDE_CHAT_MD } from "@/lib/admin-docs/admin-guide-chat";

export type AdminGuideId = "chat" | "board";

const FILE_BY_ID: Record<AdminGuideId, string> = {
  chat: "admin-guide-chat.md",
  board: "admin-guide-board.md",
};

/**
 * 관리자 사용 설명서 마크다운 — 서버에서만 호출 (빌드/런타임에 `web/docs` 파일 필요)
 */
export function readAdminGuideMd(id: AdminGuideId): string {
  // 채팅 가이드는 번들 포함 보장을 위해 모듈 문자열 (docs/*.md 는 서버리스 추적 대상이 아님).
  if (id === "chat") return ADMIN_GUIDE_CHAT_MD;
  const filename = FILE_BY_ID[id];
  const fp = path.join(process.cwd(), "docs", filename);
  try {
    return fs.readFileSync(fp, "utf8");
  } catch {
    return `# 문서를 불러올 수 없습니다\n\n파일을 찾을 수 없습니다: \`docs/${filename}\`\n`;
  }
}
