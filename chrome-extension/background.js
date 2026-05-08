const APP = "https://mrc-breath-test-system.vercel.app";

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    let navigating = false;
    const listener = (id, changeInfo) => {
      if (id !== tabId) return;
      if (changeInfo.status === "loading") navigating = true;
      if (navigating && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 200);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function extractRaceUrlsFromPage() {
  const divs = document.querySelectorAll(".race[onclick]");
  const urls = [];
  divs.forEach((div) => {
    const match = div.getAttribute("onclick").match(/race\.php\?id=(\d+)/);
    if (match) urls.push(`https://maltaracingclub.com/race.php?id=${match[1]}`);
  });
  return urls;
}

async function sendProgress(tabId, data) {
  if (!tabId) return;
  try { await chrome.tabs.sendMessage(tabId, { type: "mrc-progress", ...data }); }
  catch (_) {}
}

chrome.runtime.onMessageExternal.addListener((message, sender) => {
  if (message.type !== "import-meeting") return;

  const { meetingUrl, meetingId, token } = message;
  const senderTabId = sender.tab?.id;

  // Run async but don't block the listener
  (async () => {
    await chrome.storage.session.set({ mrc_token: token });

    const bgTab = await new Promise((resolve) =>
      chrome.tabs.create({ url: meetingUrl, active: false }, resolve)
    );

    try {
      await waitForTabLoad(bgTab.id);

      const [{ result: raceUrls }] = await chrome.scripting.executeScript({
        target: { tabId: bgTab.id },
        func: extractRaceUrlsFromPage,
      });

      if (!raceUrls?.length) {
        await sendProgress(senderTabId, { event: "error", message: "No races found on that MRC page." });
        return;
      }

      await sendProgress(senderTabId, { event: "start", total: raceUrls.length });

      for (let i = 0; i < raceUrls.length; i++) {
        if (i > 0) {
          await new Promise((resolve) => chrome.tabs.update(bgTab.id, { url: raceUrls[i] }, resolve));
          await waitForTabLoad(bgTab.id);
        }

        try {
          const [{ result: html }] = await chrome.scripting.executeScript({
            target: { tabId: bgTab.id },
            func: () => document.documentElement.outerHTML,
          });

          const res = await fetch(`${APP}/api/mrc-full-import`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ html, meetingId }),
          });

          const result = await res.json();
          if (!res.ok) throw new Error(result.error || "Import failed.");

          await sendProgress(senderTabId, {
            event: "race-done",
            index: i,
            total: raceUrls.length,
            raceNumber: result.raceNumber,
            importedCount: result.importedCount,
          });
        } catch (e) {
          await sendProgress(senderTabId, {
            event: "race-error",
            index: i,
            total: raceUrls.length,
            message: e.message,
          });
        }
      }

      await sendProgress(senderTabId, { event: "done" });
    } finally {
      chrome.tabs.remove(bgTab.id);
    }
  })();
});
