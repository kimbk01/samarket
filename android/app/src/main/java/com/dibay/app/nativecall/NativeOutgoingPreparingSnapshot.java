package com.dibay.app.nativecall;

/** 발신 준비(PREPARING) 읽기 전용 사본 — 서버 통화 id 를 받기 전이라 attemptId·roomId 만 있다. */
public final class NativeOutgoingPreparingSnapshot {
  /** "voice" | "video" */
  public final String media;
  public final String attemptId;
  public final String roomId;
  public final long startedAtWallMs;

  public NativeOutgoingPreparingSnapshot(
      String media, String attemptId, String roomId, long startedAtWallMs) {
    this.media = media;
    this.attemptId = attemptId;
    this.roomId = roomId;
    this.startedAtWallMs = startedAtWallMs;
  }
}
