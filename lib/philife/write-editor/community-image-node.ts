import { Node } from "@tiptap/core";
import { COMMUNITY_IMAGE_NODE } from "@/lib/philife/write-editor/content-codec";

/**
 * 커뮤니티 본문 이미지 블록(스키마 SSOT) — React NodeView 는 편집기 컴포넌트에서 확장한다.
 * 외부 HTML 의 <img> 는 직접 받지 않는다: 붙여넣기 정제(`sanitizePastedHtmlForEditor`)가 `data-paste-src` 로 바꾼 것만
 * 「업로드 대기」 사진으로 받아 편집기가 DIBAY 저장소로 재호스팅한다(외부 주소 저장 금지).
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
      caption: { default: "" },
      uploadId: { default: null },
      status: { default: "done" },
      error: { default: null },
      preview: { default: null },
      pasteSrc: { default: null },
    };
  },
  parseHTML() {
    return [
      {
        tag: "img[data-dibay-image]",
        getAttrs: (el) => {
          const e = el as HTMLElement;
          const pasteSrc = e.getAttribute("data-paste-src");
          const alt = e.getAttribute("alt") ?? "";
          const caption = e.getAttribute("data-caption") ?? "";
          if (pasteSrc) {
            return { src: "", alt, caption, status: "uploading", preview: pasteSrc, pasteSrc, uploadId: null, error: null };
          }
          /** 편집기 안 복사·붙여넣기(이미 DIBAY 주소) — 편집기가 소유 여부를 다시 확인한다 */
          const src = e.getAttribute("src") ?? "";
          return src
            ? { src: "", alt, caption, status: "uploading", preview: src, pasteSrc: src, uploadId: null, error: null }
            : false;
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "img",
      {
        src: HTMLAttributes.src,
        alt: HTMLAttributes.alt,
        "data-dibay-image": "",
        ...(HTMLAttributes.caption ? { "data-caption": HTMLAttributes.caption } : {}),
      },
    ];
  },
});
