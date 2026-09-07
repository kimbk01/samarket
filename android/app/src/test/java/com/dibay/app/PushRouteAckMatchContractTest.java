package com.dibay.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** T1–T4 — push route ACK exact-match contract (pure, no Android framework). */
public class PushRouteAckMatchContractTest {
  private static final String ROOM_A =
      "/community-messenger/rooms/edba2412-8e39-409c-8081-1e98c053cd6d";
  private static final String ROOM_B =
      "/community-messenger/rooms/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

  @Test
  public void t1_exactAckClears() {
    assertTrue(PushRouteAckMatch.matches(ROOM_A, ROOM_A));
  }

  @Test
  public void t2_parentRouteMustNotAckRoom() {
    assertFalse(PushRouteAckMatch.matches("/community-messenger", ROOM_A));
    assertFalse(PushRouteAckMatch.matches("/community-messenger?section=chats", ROOM_A));
  }

  @Test
  public void t3_emptyAckMustNotClear() {
    assertFalse(PushRouteAckMatch.matches("", ROOM_A));
    assertFalse(PushRouteAckMatch.matches("   ", ROOM_A));
    assertFalse(PushRouteAckMatch.matches(null, ROOM_A));
  }

  @Test
  public void t4_differentRoomMustNotClear() {
    assertFalse(PushRouteAckMatch.matches(ROOM_B, ROOM_A));
  }

  @Test
  public void queryCanonicalSameRoomAllowedWhenOneSideHasNoQuery() {
    assertTrue(PushRouteAckMatch.matches(ROOM_A, ROOM_A + "?type=group"));
    assertTrue(PushRouteAckMatch.matches(ROOM_A + "?type=group", ROOM_A));
  }
}
