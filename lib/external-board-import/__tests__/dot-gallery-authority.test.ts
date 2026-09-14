import { describe, expect, it } from "vitest";
import { extractDotContentGalleryImages } from "@/lib/external-board-import/adapters/dot-tourism";
import { findCatalogSection, countAvailableCatalogSections } from "@/lib/external-board-import/catalog/source-catalog";

describe("CUT B DOT gallery image authority", () => {
  it("extracts content-gallery-main images without logo noise", () => {
    const html = `
      <ul class="content-gallery-main__gallery">
        <li class="content-gallery-main__gallery-item">
          <a href="https://cdn.example/DIDANGS-MASAREAL-MANDAUE-CITY-6-scaled.jpg" data-pswp-src="https://cdn.example/DIDANGS-MASAREAL-MANDAUE-CITY-6-scaled.jpg">
            <img src="https://cdn.example/DIDANGS-MASAREAL-MANDAUE-CITY-6-1024x681.jpg" alt="Didangs" />
          </a>
        </li>
        <li class="content-gallery-main__gallery-item">
          <a href="https://cdn.example/MANDAUE-CITY-BIBINGKA-2-1-scaled.jpg">
            <img src="https://cdn.example/MANDAUE-CITY-BIBINGKA-2-1-1024x681.jpg" alt="Bibingka" />
          </a>
        </li>
      </ul>
      <img src="https://cdn.example/logo.png" class="site-logo" />
    `;
    const imgs = extractDotContentGalleryImages(html);
    expect(imgs).toHaveLength(2);
    expect(imgs[0]?.src).toContain("DIDANGS-MASAREAL");
    expect(imgs[1]?.src).toContain("MANDAUE-CITY-BIBINGKA");
  });

  it("DOT Central Visayas is available after bodyImage proven", () => {
    const cv = findCatalogSection("dot-central-visayas");
    expect(cv?.section.capabilities.bodyImage).toBe("proven");
    expect(cv?.section.status).toBe("available");
    expect(countAvailableCatalogSections()).toBeGreaterThanOrEqual(1);
  });
});
