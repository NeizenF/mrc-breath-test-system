// Runs on the MRC app domain — extracts the Supabase session token and caches it
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
