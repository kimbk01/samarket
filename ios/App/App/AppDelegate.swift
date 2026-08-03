import UIKit
import Capacitor
import KakaoSDKAuth
import KakaoSDKCommon

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        if let appKey = Bundle.main.object(forInfoDictionaryKey: "KAKAO_NATIVE_APP_KEY") as? String {
            let trimmed = appKey.trimmingCharacters(in: .whitespacesAndNewlines)
            let isPlaceholder = trimmed.isEmpty || trimmed.hasPrefix("$(") || trimmed.contains("YOUR_KAKAO")
            if !isPlaceholder {
                KakaoSDK.initSDK(appKey: trimmed)
            }
        }
        VoIPPushRegistry.shared.start()
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        DibayActiveCallSessionManager.shared.onAppBackground()
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        DibayActiveCallSessionManager.shared.onAppForeground()
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        DibayActiveCallSessionManager.shared.onAppForeground()
        ScreenAwakeBridge.shared.reapplyOnBecomeActive()
        CallV4SurfaceOwnerBridge.flushPending()
        // Gate 3 Step 11 — do NOT re-apply versionless Cap prefs on resume.
        // Final App Icon = versioned canonical A+B via Web → apply(appIconTotal:).
        _ = DibayAppIconDeliveryAdapter.applyFromCapBadgeCache()
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // KakaoTalk + Kakao account(SDK) oauth — kakao{NATIVE_APP_KEY}://oauth
        if url.scheme?.hasPrefix("kakao") == true {
            if AuthController.handleOpenUrl(url: url) {
                return true
            }
        }
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // Capacitor PushNotifications — alert APNs token bridge (NOT VoIP/PushKit).
    // Without this forward, registerForRemoteNotifications succeeds but JS never gets `registration`.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    // iOS Delivery Adapter v1 — APNS aps.badge / badgeCount → SpringBoard (echo only).
    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        DibayAppIconDeliveryAdapter.applyFromPushUserInfo(userInfo)
        completionHandler(.noData)
    }

}
