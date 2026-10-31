// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { ImportedRichContent } from "@/components/community/post-detail/ImportedRichContent";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("서식 본문 읽기 화면 (승인 ①)", () => {
  it("굵게·기울임·링크(새 창·nofollow)·목록 조각·인용 줄바꿈·사진 설명", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <ImportedRichContent
          blocks={[
            { t: "h", level: 2, text: "제목" },
            { t: "p", text: "가 나 다", runs: [{ text: "가 " }, { text: "나", b: true, i: true }, { text: " 다", href: "https://x.com/" }] },
            { t: "ul", items: ["하나", "둘"], itemRuns: [[{ text: "하나" }], [{ text: "둘", b: true }]] },
            { t: "quote", text: "줄1\n줄2", runs: [{ text: "줄1\n줄2" }] },
            {
              t: "img",
              url: "https://p.supabase.co/storage/v1/object/public/post-images/u/community/a.webp",
              alt: null,
              caption: "설명",
            },
          ]}
        />
      );
    });
    expect(host.querySelector("h2")!.textContent).toBe("제목");
    const strong = host.querySelector("p strong")!;
    expect(strong.textContent).toBe("나");
    expect(strong.querySelector("em")).not.toBeNull();
    const a = host.querySelector("p a")!;
    expect(a.getAttribute("href")).toBe("https://x.com/");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toContain("nofollow");
    expect(host.querySelectorAll("ul li strong")).toHaveLength(1);
    expect(host.querySelector("blockquote")!.className).toContain("whitespace-pre-line");
    expect(host.querySelector("figcaption")!.textContent).toBe("설명");
    expect(host.innerHTML).not.toMatch(/style="color|<script/);
    act(() => root.unmount());
    host.remove();
  });
});
