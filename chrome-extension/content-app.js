// Expose extension ID to the web page so it can send messages to this extension
window.mrcExtensionId = chrome.runtime.id;

// Relay progress messages from background -> web page via CustomEvent
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "mrc-progress") {
    window.dispatchEvent(new CustomEvent("mrc-import-progress", { detail: message }));
  }
});

// Cache Supabase session token for extension use
(function () {
  try {
    const key = Object.keys(localStorage).find(
      (k) => k.startsWith("sb-") && k.endsWith("-auth-token")
    );
    if (!key) return;
    const session = JSON.parse(localStorage.getItem(key) || "{}");
    const token = session?.access_token;
    if (token) chrome.storage.session.set({ mrc_token: token });
  } catch (_) {}
})();
