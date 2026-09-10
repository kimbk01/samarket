import * as cheerio from "cheerio";

const DROP_TAGS = [
  "script",
  "style",
  "noscript",
  "form",
  "button",
  "input",
  "textarea",
  "select",
  "option",
  "iframe",
  "object",
  "embed",
  "applet",
  "link",
  "meta",
  "svg",
  "canvas",
  "video",
  "audio",
  "source",
  "track",
];

const DROP_ATTR_PREFIXES = ["on"];

/**
 * Strip executable / chrome-y markup from an HTML fragment before markdown conversion.
 */
export function sanitizeHtmlFragment(html: string): string {
  const $ = cheerio.load(`<div id="__root">${html}</div>`, { xml: false });
  const root = $("#__root");

  for (const tag of DROP_TAGS) {
    root.find(tag).remove();
  }

  root.find("*").each((_, el) => {
    // Use cheerio's element handle directly — avoid cross-package domhandler Element mismatch.
    const attribs = (($(el).attr() ?? {}) as Record<string, string>) || {};
    for (const name of Object.keys(attribs)) {
      const lower = name.toLowerCase();
      if (DROP_ATTR_PREFIXES.some((p) => lower.startsWith(p))) {
        $(el).removeAttr(name);
        continue;
      }
      if (lower === "style" || lower === "class" || lower === "id") {
        $(el).removeAttr(name);
        continue;
      }
      if (
        (lower === "href" || lower === "src" || lower === "xlink:href") &&
        /^javascript:/i.test(attribs[name] ?? "")
      ) {
        $(el).removeAttr(name);
      }
    }
  });

  root.find("img").each((_, el) => {
    const $el = $(el);
    const wAttr = $el.attr("width");
    const hAttr = $el.attr("height");
    if (wAttr == null || hAttr == null) return;
    const w = Number(wAttr);
    const h = Number(hAttr);
    if ((w === 1 && h === 1) || (w === 0 && h === 0)) $el.remove();
  });

  return root.html() ?? "";
}
