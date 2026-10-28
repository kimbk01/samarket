import Intents
import UserNotifications

/// DIBAY Push NSE
/// - 관리자 캠페인 이미지 첨부 (imageUrl / push_image_url / bigPictureUrl)
/// - 알림 표시 SSOT (2026-10-29): `presKind == "message"` 이면 보낸 사람 사진을 붙인 커뮤니케이션 알림
///   (잠금화면에 사람 사진 + 작은 DIBAY 아이콘). 종류·사진·묶음은 서버 `notification-presentation.ts` 가 정한다.
final class NotificationService: UNNotificationServiceExtension {
  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var bestAttemptContent: UNMutableNotificationContent?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    self.contentHandler = contentHandler
    guard let mutable = (request.content.mutableCopy() as? UNMutableNotificationContent) else {
      contentHandler(request.content)
      return
    }
    bestAttemptContent = mutable

    let userInfo = mutable.userInfo
    if (userInfo["presKind"] as? String) == "message" {
      applyMessageSender(to: mutable, userInfo: userInfo, contentHandler: contentHandler)
      return
    }

    let imageUrlString =
      (userInfo["imageUrl"] as? String)
        ?? (userInfo["push_image_url"] as? String)
        ?? (userInfo["bigPictureUrl"] as? String)

    guard let url = httpsUrl(imageUrlString) else {
      contentHandler(mutable)
      return
    }

    downloadImage(from: url) { attachment in
      if let attachment {
        mutable.attachments = [attachment]
      }
      contentHandler(mutable)
    }
  }

  override func serviceExtensionTimeWillExpire() {
    if let contentHandler, let bestAttemptContent {
      contentHandler(bestAttemptContent)
    }
  }

  // MARK: - 메시지 = 보낸 사람 사진 (커뮤니케이션 알림)

  private func applyMessageSender(
    to mutable: UNMutableNotificationContent,
    userInfo: [AnyHashable: Any],
    contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    let senderName = (userInfo["senderName"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    let name = (senderName?.isEmpty == false ? senderName : nil) ?? mutable.title
    let threadKey = (userInfo["presThreadKey"] as? String) ?? mutable.threadIdentifier
    let roomName = (userInfo["roomName"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let isGroup =
      (userInfo["roomKind"] as? String) == "group" || (userInfo["type"] as? String) == "group_message"

    let finish: (Data?) -> Void = { imageData in
      let sender = INPerson(
        personHandle: INPersonHandle(value: name, type: .unknown),
        nameComponents: nil,
        displayName: name,
        image: imageData.map { INImage(imageData: $0) },
        contactIdentifier: nil,
        customIdentifier: name
      )
      let intent = INSendMessageIntent(
        recipients: nil,
        outgoingMessageType: .outgoingMessageText,
        content: mutable.body,
        speakableGroupName: isGroup && !roomName.isEmpty ? INSpeakableString(spokenPhrase: roomName) : nil,
        conversationIdentifier: threadKey,
        serviceName: nil,
        sender: sender,
        attachments: nil
      )
      if let image = sender.image {
        intent.setImage(image, forParameterNamed: \.sender)
      }
      let interaction = INInteraction(intent: intent, response: nil)
      interaction.direction = .incoming
      interaction.donate { _ in
        do {
          contentHandler(try mutable.updating(from: intent))
        } catch {
          contentHandler(mutable)
        }
      }
    }

    guard let url = httpsUrl(userInfo["presImageUrl"] as? String) else {
      finish(nil)
      return
    }
    var request = URLRequest(url: url)
    request.timeoutInterval = 5
    URLSession.shared.dataTask(with: request) { data, response, _ in
      let ok = (response as? HTTPURLResponse)?.statusCode == 200
      finish(ok ? data : nil)
    }.resume()
  }

  // MARK: - 이미지 첨부

  private func httpsUrl(_ raw: String?) -> URL? {
    guard let s = raw?.trimmingCharacters(in: .whitespacesAndNewlines),
          s.lowercased().hasPrefix("https://") else { return nil }
    return URL(string: s)
  }

  private func downloadImage(from url: URL, completion: @escaping (UNNotificationAttachment?) -> Void) {
    var request = URLRequest(url: url)
    request.timeoutInterval = 10
    URLSession.shared.downloadTask(with: request) { tempUrl, _, _ in
      guard let tempUrl else {
        completion(nil)
        return
      }
      let ext = url.pathExtension.isEmpty ? "jpg" : url.pathExtension
      let dest = URL(fileURLWithPath: NSTemporaryDirectory())
        .appendingPathComponent(UUID().uuidString)
        .appendingPathExtension(ext)
      do {
        try FileManager.default.moveItem(at: tempUrl, to: dest)
        let attachment = try UNNotificationAttachment(identifier: "push-image", url: dest, options: nil)
        completion(attachment)
      } catch {
        completion(nil)
      }
    }.resume()
  }
}
