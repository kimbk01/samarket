import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  getOAuthLoginPrimaryButtonBase,
  getOAuthLoginPrimaryStyle,
  OAuthLoginProviderIcon,
} from "@/components/auth/OAuthLoginProviderVisuals";

describe("P1-16 brand visuals", () => {
  it("Google: official 4-colour G, white bg, 1px #747775 border, #1F1F1F label", () => {
    const html = renderToStaticMarkup(<OAuthLoginProviderIcon provider="google" />);
    for (const c of ["#EA4335", "#4285F4", "#FBBC05", "#34A853"]) expect(html).toContain(c);
    expect(html).not.toContain("currentColor");
    const style = getOAuthLoginPrimaryStyle("google");
    expect(style?.buttonClassName).toContain("bg-white");
    expect(style?.buttonClassName).toContain("border border-[#747775]");
    expect(style?.labelClassName).toContain("#1F1F1F");
  });

  it("Kakao: #FEE500 bg, black bubble symbol, rgba(0,0,0,0.85) label", () => {
    const html = renderToStaticMarkup(<OAuthLoginProviderIcon provider="kakao" />);
    expect(html).toContain('fill="#000000"');
    const style = getOAuthLoginPrimaryStyle("kakao");
    expect(style?.buttonClassName).toContain("bg-[#FEE500]");
    expect(style?.labelClassName).toContain("rgba(0,0,0,0.85)");
  });

  it("Apple unchanged: black bg, white label", () => {
    const style = getOAuthLoginPrimaryStyle("apple");
    expect(style?.buttonClassName).toContain("bg-black");
    expect(style?.labelClassName).toBe("text-white");
  });

  it("P2-15 radius: page = rounded-ui-rect, overlay = --overlay-radius-md", () => {
    expect(getOAuthLoginPrimaryButtonBase("page")).toContain("rounded-ui-rect");
    expect(getOAuthLoginPrimaryButtonBase("overlay")).toContain("rounded-[length:var(--overlay-radius-md)]");
    expect(getOAuthLoginPrimaryButtonBase("page")).not.toContain("rounded-xl");
  });
});
