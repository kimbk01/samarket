import { describe, expect, it } from "vitest";
import { partitionMessengerUnreadRoomFactsFromParticipants } from "@/lib/notifications/load-messenger-unread-room-facts-from-participants";

describe("partitionMessengerUnreadRoomFactsFromParticipants", () => {
  it("counts active GD+group unread rooms; excludes left and deleted", () => {
    const out = partitionMessengerUnreadRoomFactsFromParticipants(
      [
        { room_id: "gd-1", unread_count: 1, left_at: null },
        { room_id: "gd-2", unread_count: 2, left_at: null },
        { room_id: "gd-left", unread_count: 9, left_at: "2026-07-23T00:00:00Z" },
        { room_id: "grp-1", unread_count: 1, left_at: null },
        { room_id: "trade-skip", unread_count: 3, left_at: null },
        { room_id: "gd-zero", unread_count: 0, left_at: null },
      ],
      [
        { id: "gd-1", chat_domain: "general_direct", deleted_at: null },
        { id: "gd-2", chat_domain: "general_direct", deleted_at: null },
        { id: "gd-left", chat_domain: "general_direct", deleted_at: null },
        { id: "grp-1", chat_domain: "group", deleted_at: null },
        { id: "trade-skip", chat_domain: "trade", deleted_at: null },
        { id: "gd-zero", chat_domain: "general_direct", deleted_at: null },
        { id: "gd-deleted", chat_domain: "general_direct", deleted_at: "2026-07-01T00:00:00Z" },
      ]
    );

    expect(out.domainUnreadRooms.general_direct).toBe(2);
    expect(out.domainUnreadRooms.group).toBe(1);
    expect(out.generalDirectUnreadRoomIds).toEqual(["gd-1", "gd-2"]);
    expect(out.groupUnreadRoomIds).toEqual(["grp-1"]);
    expect(out.rowUnreadByRoomId).toEqual({ "gd-1": 1, "gd-2": 2, "grp-1": 1 });
  });

  it("Xiaomi Phase A shape: 4 visible GD unread → bottom messenger 4", () => {
    const four = [
      "04acdc35-9ab0-4c73-9798-54033e9a8ff3",
      "17b4cdfc-0f55-4a75-b732-a301b762647a",
      "cf1b4d85-e9b5-4c11-8432-92c2bc6d498b",
      "682bb732-1e50-40a0-ba24-111729f362ec",
    ];
    const out = partitionMessengerUnreadRoomFactsFromParticipants(
      [
        ...four.map((id, i) => ({
          room_id: id,
          unread_count: i === 3 ? 2 : 1,
          left_at: null,
        })),
        // left group historically inflated Bottom via notification_targets
        {
          room_id: "8d65c2ad-a721-4cca-ac4a-00066d8cf6a1",
          unread_count: 1,
          left_at: "2026-07-23T19:30:52.651+00:00",
        },
      ],
      [
        ...four.map((id) => ({ id, chat_domain: "general_direct", deleted_at: null })),
        {
          id: "8d65c2ad-a721-4cca-ac4a-00066d8cf6a1",
          chat_domain: "group",
          deleted_at: null,
        },
      ]
    );
    expect(out.domainUnreadRooms.general_direct).toBe(4);
    expect(out.domainUnreadRooms.group).toBe(0);
    expect(out.generalDirectUnreadRoomIds).toHaveLength(4);
  });
});
