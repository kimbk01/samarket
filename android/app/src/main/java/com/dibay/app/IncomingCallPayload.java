package com.dibay.app;

public final class IncomingCallPayload {
  final String callId;
  final String roomId;
  final String callerId;
  final String callerName;
  final String callerAvatarUrl;
  final String callType;
  final String expiresAt;
  final String title;
  final String body;
  final String invalidReason;

  IncomingCallPayload(
      String callId,
      String roomId,
      String callerId,
      String callerName,
      String callerAvatarUrl,
      String callType,
      String expiresAt,
      String title,
      String body,
      String invalidReason) {
    this.callId = callId;
    this.roomId = roomId;
    this.callerId = callerId;
    this.callerName = callerName;
    this.callerAvatarUrl = callerAvatarUrl;
    this.callType = callType;
    this.expiresAt = expiresAt;
    this.title = title;
    this.body = body;
    this.invalidReason = invalidReason;
  }

  static IncomingCallPayload invalid(String reason) {
    return new IncomingCallPayload(null, null, null, null, null, null, null, null, null, reason);
  }

  boolean isValid() {
    return invalidReason == null && callId != null && roomId != null && callerId != null && callType != null;
  }

  IncomingCallPayload withExpiresAt(String nextExpiresAt) {
    return new IncomingCallPayload(
        callId,
        roomId,
        callerId,
        callerName,
        callerAvatarUrl,
        callType,
        nextExpiresAt != null ? nextExpiresAt : expiresAt,
        title,
        body,
        invalidReason);
  }
}
