import UserNotifications

/// DIBAY Push image NSE — IMAGE ONLY (admin campaign rich push).
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
    let imageUrlString =
      (userInfo["imageUrl"] as? String)
        ?? (userInfo["push_image_url"] as? String)
        ?? (userInfo["bigPictureUrl"] as? String)

    guard let urlString = imageUrlString?.trimmingCharacters(in: .whitespacesAndNewlines),
          urlString.lowercased().hasPrefix("https://"),
          let url = URL(string: urlString) else {
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
