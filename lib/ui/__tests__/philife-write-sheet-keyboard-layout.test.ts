import { describe, expect, it } from "vitest";
import { philifeWriteSheetShellStyle } from "@/lib/ui/philife-write-sheet-keyboard-layout";

describe("philifeWriteSheetShellStyle", () => {
  it("applies keyboard inset to shell bottom", () => {
    expect(philifeWriteSheetShellStyle(120, 280)).toEqual({ top: 120, bottom: 280 });
  });

  it("clamps negative keyboard inset to zero", () => {
    expect(philifeWriteSheetShellStyle(80, -10)).toEqual({ top: 80, bottom: 0 });
  });
});
