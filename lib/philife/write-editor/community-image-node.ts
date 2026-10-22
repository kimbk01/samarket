import { Node } from "@tiptap/core";
import { COMMUNITY_IMAGE_NODE } from "@/lib/philife/write-editor/content-codec";

/**
 * 커뮤니티 본문 이미지 블록(스키마 SSOT) — React NodeView 는 편집기 컴포넌트에서 확장한다.
 * 외부 HTML 의 <img> 는 직접 파싱하지 않는다(붙여넣기는 재호스팅 경로로만).
 */
export const CommunityImageNodeBase = Node.create({
  name: COMMUNITY_IMAGE_NODE,
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      src: { default: "" },
      alt: { default: "" },
      uploadId: { default: null },
      status: { default: "done" },
      error: { default: null },
      preview: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: "img[data-dibay-image]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["img", { src: HTMLAttributes.src, alt: HTMLAttributes.alt, "data-dibay-image": "" }];
  },
});
