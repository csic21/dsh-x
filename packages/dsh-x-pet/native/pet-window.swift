// dsh-x-pet's desktop shell.
//
// A DOM overlay is clipped by the app window, so the pet gets a window of its
// own: a borderless, transparent, non-activating panel that floats above every
// space. It loads the same `/api/dsh-x-pet/frame` document the browser fallback
// uses, so there is one renderer to keep correct, not two.
//
// Usage: pet-window --bootstrap <authenticated root url> --page <frame path>
//                   [--width 280] [--height 340]
//
// The Bootstrap URL carries the launch token, which mints the auth cookie; the
// page is loaded after that redirect lands.

import AppKit
import WebKit

/// The rectangle the sprite occupies inside the page, in window coordinates
/// with the origin at the bottom-left (AppKit's orientation).
private struct HitRect {
    var x: CGFloat = 0
    var y: CGFloat = 0
    var width: CGFloat = 0
    var height: CGFloat = 0

    func contains(_ point: NSPoint) -> Bool {
        guard width > 0, height > 0 else { return false }
        return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height
    }
}

private final class PetShell: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    private var panel: NSPanel!
    private var webView: WKWebView!
    private let pageURL: URL
    private var spriteRect = HitRect()
    private var loadedPage = false
    private var globalMonitor: Any?
    private var localMonitor: Any?

    init(bootstrap: URL, page: URL, width: CGFloat, height: CGFloat) {
        pageURL = page
        super.init()
        let frame = NSRect(x: 0, y: 0, width: width, height: height)

        panel = NSPanel(
            contentRect: frame,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.hidesOnDeactivate = false
        panel.isMovableByWindowBackground = false
        panel.becomesKeyOnlyIfNeeded = true
        // Nothing is clickable until the page reports where the sprite is, so
        // the invisible corners never swallow a click meant for another app.
        panel.ignoresMouseEvents = true

        let configuration = WKWebViewConfiguration()
        let controller = WKUserContentController()
        controller.add(self, name: "pet")
        controller.addUserScript(WKUserScript(
            source: """
            window.dshDesktopPet = {
              move: (dx, dy) => window.webkit.messageHandlers.pet.postMessage({ t: 'move', dx, dy }),
              hover: () => {},
              rect: (x, y, w, h) => window.webkit.messageHandlers.pet.postMessage({ t: 'rect', x, y, w, h }),
              close: () => window.webkit.messageHandlers.pet.postMessage({ t: 'close' })
            };
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        configuration.userContentController = controller
        configuration.suppressesIncrementalRendering = false

        webView = WKWebView(frame: frame, configuration: configuration)
        webView.autoresizingMask = [.width, .height]
        webView.setValue(false, forKey: "drawsBackground")
        if #available(macOS 12.0, *) { webView.underPageBackgroundColor = .clear }
        webView.navigationDelegate = self

        panel.contentView = webView
        // Bottom-right of the main screen, 24pt in from the corner.
        if let screen = NSScreen.main {
            let visible = screen.visibleFrame
            panel.setFrameOrigin(NSPoint(
                x: visible.maxX - width - 24,
                y: visible.minY + 24
            ))
        }
        panel.orderFrontRegardless()

        globalMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.mouseMoved, .leftMouseDragged]) { [weak self] _ in
            self?.updateHitTesting()
        }
        localMonitor = NSEvent.addLocalMonitorForEvents(matching: [.mouseMoved, .leftMouseDragged]) { [weak self] event in
            self?.updateHitTesting()
            return event
        }

        webView.load(URLRequest(url: bootstrap))
    }

    deinit {
        if let globalMonitor { NSEvent.removeMonitor(globalMonitor) }
        if let localMonitor { NSEvent.removeMonitor(localMonitor) }
    }

    /// The bubble is taller than the sprite, so only the sprite takes clicks;
    /// everywhere else the panel stays transparent to input.
    private func updateHitTesting() {
        let point = panel.convertPoint(fromScreen: NSEvent.mouseLocation)
        let inside = panel.frame.contains(NSEvent.mouseLocation) && spriteRect.contains(point)
        if panel.ignoresMouseEvents == inside { panel.ignoresMouseEvents = !inside }
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let kind = body["t"] as? String else { return }
        switch kind {
        case "move":
            // The page reports a pointer delta in CSS pixels: right and down are
            // positive there, while AppKit's y grows upward.
            guard let dx = body["dx"] as? Double, let dy = body["dy"] as? Double else { return }
            var origin = panel.frame.origin
            origin.x += CGFloat(dx)
            origin.y -= CGFloat(dy)
            panel.setFrameOrigin(origin)
            updateHitTesting()
        case "rect":
            guard let x = body["x"] as? Double, let y = body["y"] as? Double,
                  let width = body["w"] as? Double, let height = body["h"] as? Double else { return }
            let contentHeight = panel.contentLayoutRect.height
            spriteRect = HitRect(
                x: CGFloat(x),
                y: contentHeight - CGFloat(y) - CGFloat(height),
                width: CGFloat(width),
                height: CGFloat(height)
            )
            updateHitTesting()
        case "close":
            NSApp.terminate(nil)
        default:
            break
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard !loadedPage else { return }
        loadedPage = true
        // The bootstrap redirect has already minted the auth cookie.
        webView.load(URLRequest(url: pageURL))
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        NSApp.terminate(nil)
    }
}

private func argument(_ name: String) -> String? {
    let arguments = CommandLine.arguments
    guard let index = arguments.firstIndex(of: name), index + 1 < arguments.count else { return nil }
    return arguments[index + 1]
}

let application = NSApplication.shared
application.setActivationPolicy(.accessory)

guard let bootstrapText = argument("--bootstrap"), let bootstrap = URL(string: bootstrapText),
      let pageText = argument("--page"), let page = URL(string: pageText) else {
    FileHandle.standardError.write(Data("pet-window: --bootstrap and --page are required\n".utf8))
    exit(2)
}

let width = CGFloat(Double(argument("--width") ?? "280") ?? 280)
let height = CGFloat(Double(argument("--height") ?? "340") ?? 340)
private let shell = PetShell(bootstrap: bootstrap, page: page, width: width, height: height)
withExtendedLifetime(shell) {
    application.run()
}
