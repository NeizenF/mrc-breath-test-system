// Inject extension ID into the page's main world (isolated world can't share window properties directly)
const script = document.createElement("script");
script.textContent = `window.mrcExtensionId = ${JSON.stringify(chrome.runtime.id)};`;
document.documentElement.appendChild(script);
script.remove();

// Relay progress messages from background -> page via CustomEvent
// (dispatchEvent on window IS shared between isolated world and page)
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
