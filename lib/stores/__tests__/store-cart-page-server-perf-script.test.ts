import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildStoreCartPageServerPerfPayload,
  serializeStoreCartPageServerPerfForScript,
} from "@/lib/stores/store-cart-page-server-perf";

describe("CRT-12 cart page perf script serialization", () => {
  const hostile = "</script><script>window.__x=1</script>";

  it("does not let a decoded slug close the JSON script tag", () => {
    const json = serializeStoreCartPageServerPerfForScript(buildStoreCartPageServerPerfPayload(hostile, 3));
    const html = renderToStaticMarkup(
      createElement("script", { type: "application/json", dangerouslySetInnerHTML: { __html: json } })
    );
    expect(html).not.toContain("<script>window.__x=1");
    expect(html.match(/<\/script>/g)?.length).toBe(1);
  });

  it("round-trips to the same payload", () => {
    const payload = buildStoreCartPageServerPerfPayload(`${hostile} & \u2028`, 7);
    expect(JSON.parse(serializeStoreCartPageServerPerfForScript(payload))).toEqual(payload);
  });
});
