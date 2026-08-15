/**
 * GET /api/trade/national-lgu
 * - ?q= search (N5 picker; not wired to P0 panel)
 * - ?id= lookup
 * - ?mode=resolve&cityMunicipality=&province= — Address → national LGU (N3 write)
 */
import { NextRequest } from "next/server";
import { jsonErrorWithRequest, jsonOkWithRequest } from "@/lib/http/api-route";
import { searchTradeNationalLgu } from "@/lib/trade/location/national/search-trade-national-lgu";
import {
  getTradeNationalLguById,
  loadTradeNationalLguDataset,
} from "@/lib/trade/location/national/load-national-lgu-dataset";
import { resolveTradeNationalLguFromAddressFields } from "@/lib/trade/location/national/resolve-from-address-fields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const mode = (sp.get("mode") ?? "").trim().toLowerCase();

    if (mode === "resolve") {
      const cityMunicipality = (sp.get("cityMunicipality") ?? "").trim();
      const province = (sp.get("province") ?? "").trim();
      const resolution = resolveTradeNationalLguFromAddressFields({
        cityMunicipality: cityMunicipality || null,
        province: province || null,
      });
      return jsonOkWithRequest(req, {
        datasetVersion: loadTradeNationalLguDataset().datasetVersion,
        resolution,
      });
    }

    const id = (sp.get("id") ?? "").trim();
    if (id) {
      const lgu = getTradeNationalLguById(id);
      if (!lgu) {
        return jsonErrorWithRequest(req, "national_lgu_not_found", 404);
      }
      return jsonOkWithRequest(req, {
        datasetVersion: loadTradeNationalLguDataset().datasetVersion,
        item: {
          canonicalId: lgu.canonicalId,
          displayName: lgu.displayName,
          lguType: lgu.lguType,
          regionCode: lgu.regionCode,
          regionName: lgu.regionName,
          provinceCode: lgu.provinceCode,
          provinceName: lgu.provinceName,
        },
      });
    }

    const q = (sp.get("q") ?? "").trim();
    const limitRaw = Number(sp.get("limit") ?? "20");
    const limit = Number.isFinite(limitRaw) ? limitRaw : 20;
    const hits = searchTradeNationalLgu(q, { limit });
    return jsonOkWithRequest(req, {
      datasetVersion: loadTradeNationalLguDataset().datasetVersion,
      query: q,
      results: hits,
    });
  } catch (e) {
    console.error("[trade/national-lgu]", e);
    return jsonErrorWithRequest(req, "national_lgu_search_failed", 500);
  }
}
