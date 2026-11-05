import UIKit

/// Single window scene (Info.plist UIApplicationSceneManifest). The window and
/// DibayRootBridgeViewController come from Main.storyboard via UISceneStoryboardFile.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard scene is UIWindowScene else { return }
        // SplashScreen and other plugins look up UIApplication.shared.delegate?.window first.
        (UIApplication.shared.delegate as? AppDelegate)?.window = window

        let urlContexts = connectionOptions.urlContexts
        let userActivities = connectionOptions.userActivities
        NSLog(
            "[DibayScene] will_connect url_contexts=%d user_activities=%d",
            urlContexts.count,
            userActivities.count
        )
        guard !urlContexts.isEmpty || !userActivities.isEmpty else { return }
        // Cold start: deliver after the storyboard window is shown and the Capacitor bridge has
        // registered its plugins, matching application(_:open:) after didFinishLaunching.
        DispatchQueue.main.async {
            NSLog("[DibayScene] cold_start_deliver url_contexts=%d user_activities=%d", urlContexts.count, userActivities.count)
            for context in urlContexts {
                AppDelegate.handleOpenURLContext(context)
            }
            for activity in userActivities {
                AppDelegate.handleContinueUserActivity(activity)
            }
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        NSLog("[DibayScene] open_url_contexts count=%d", URLContexts.count)
        for context in URLContexts {
            AppDelegate.handleOpenURLContext(context)
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        NSLog("[DibayScene] continue_user_activity")
        AppDelegate.handleContinueUserActivity(userActivity)
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
        AppDelegate.handleDidEnterBackground()
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
        AppDelegate.handleWillEnterForeground()
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        AppDelegate.handleDidBecomeActive()
    }
}
