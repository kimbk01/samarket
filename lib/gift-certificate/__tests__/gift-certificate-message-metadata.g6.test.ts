import { describe, expect, it } from "vitest";
import { parseGiftCertificateMessageMetadata } from "@/lib/gift-certificate/gift-certificate-message-metadata";

describe("gift-certificate-message-metadata G6", () => {
  it("requires gift_transfer_id", () => {
    expect(parseGiftCertificateMessageMetadata({ face_value: 1000 })).toBeNull();
    expect(parseGiftCertificateMessageMetadata(null)).toBeNull();
  });

  it("parses PENDING transfer card metadata", () => {
    const meta = parseGiftCertificateMessageMetadata({
      gift_transfer_id: "tr-1",
      instance_id: "inst-1",
      face_value: 1000.7,
      remaining_balance: 700,
      transfer_status: "pending",
    });
    expect(meta).toEqual({
      gift_transfer_id: "tr-1",
      instance_id: "inst-1",
      store_id: undefined,
      store_name: undefined,
      title: undefined,
      image_url: null,
      face_value: 1000,
      remaining_balance: 700,
      transfer_status: "PENDING",
    });
  });

  it("normalizes unknown status to PENDING", () => {
    const meta = parseGiftCertificateMessageMetadata({
      gift_transfer_id: "tr-2",
      transfer_status: "weird",
    });
    expect(meta?.transfer_status).toBe("PENDING");
  });
});
