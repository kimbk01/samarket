import Foundation

/**
 * Member private-event eligibility projection for iOS.
 *
 * Gates CallKit sustained ring + APNs alert presentation we control (foreground/tap)
 * + shared logout fail-closed with Android.
 *
 * NOT global auth SSOT — projection of web/session authenticated state.
 * Fail-closed: missing key ⇒ ineligible.
 */
enum DibayMemberEventEligibilityStore {
  private static let eligibleKey = "dibay_member_event_eligible"
  private static let boundUserKey = "dibay_bound_member_user_id"

  static func setEligible(_ eligible: Bool, reason: String) {
    UserDefaults.standard.set(eligible, forKey: eligibleKey)
    if !eligible {
      UserDefaults.standard.removeObject(forKey: boundUserKey)
    }
    DibayCallLog.infoCall(
      "[auth] member_event_eligible_set",
      callId: "none",
      detail: "eligible=\(eligible) reason=\(reason)"
    )
  }

  static func setBoundMemberUserId(_ userId: String?, reason: String) {
    let id = (userId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    if id.isEmpty {
      UserDefaults.standard.removeObject(forKey: boundUserKey)
    } else {
      UserDefaults.standard.set(id, forKey: boundUserKey)
    }
    DibayCallLog.infoCall(
      "[auth] bound_member_user_set",
      callId: "none",
      detail: "has_user=\(!id.isEmpty) reason=\(reason)"
    )
  }

  static func boundMemberUserId() -> String {
    (UserDefaults.standard.string(forKey: boundUserKey) ?? "")
      .trimmingCharacters(in: .whitespacesAndNewlines)
  }

  static func isMemberEventEligible() -> Bool {
    UserDefaults.standard.bool(forKey: eligibleKey)
  }

  /// Mirrors `lib/push/native/can-present-authenticated-notification.ts`.
  static func canPresentAuthenticatedNotification(payloadRecipientUserId: String?) -> Bool {
    presentDecision(payloadRecipientUserId: payloadRecipientUserId).ok
  }

  static func presentDecision(payloadRecipientUserId: String?) -> (ok: Bool, reason: String) {
    guard isMemberEventEligible() else {
      return (false, "member_event_ineligible")
    }
    let bound = boundMemberUserId()
    guard !bound.isEmpty else {
      return (false, "bound_user_missing")
    }
    let recipient = (payloadRecipientUserId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    if !recipient.isEmpty && recipient != bound {
      return (false, "recipient_user_mismatch")
    }
    return (true, "present")
  }

  static func resolvePayloadRecipientUserId(from userInfo: [AnyHashable: Any]) -> String? {
    let keys = [
      "recipientMemberId",
      "recipient_member_id",
      "targetUserId",
      "target_user_id",
      "userId",
      "user_id",
      "recipientUserId",
      "recipient_user_id",
    ]
    for key in keys {
      if let raw = userInfo[key] as? String {
        let t = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if !t.isEmpty { return t }
      }
    }
    return nil
  }
}
