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
  const senderTabId = sender.tab?.id;

  // ── Race import ────────────────────────────────────────────────────────────
  if (message.type === "import-meeting") {
    const { meetingUrl, meetingId, token } = message;

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
          await new Promise((resolve) => chrome.tabs.update(bgTab.id, { url: raceUrls[i] }, resolve));
          await waitForTabLoad(bgTab.id);

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
  }

  // ── Race analyser ──────────────────────────────────────────────────────────
  if (message.type === "analyse-race") {
    const { raceUrl, token } = message;

    (async () => {
      const bgTab = await new Promise((resolve) =>
        chrome.tabs.create({ url: raceUrl, active: false }, resolve)
      );

      try {
        await waitForTabLoad(bgTab.id);

        // Grab race page HTML
        const [{ result: raceHtml }] = await chrome.scripting.executeScript({
          target: { tabId: bgTab.id },
          func: () => document.documentElement.outerHTML,
        });

        // Extract horse profile links from the race page DOM
        const [{ result: horseLinks }] = await chrome.scripting.executeScript({
          target: { tabId: bgTab.id },
          func: () => {
            const seen = new Set();
            const links = [];
            document.querySelectorAll("td.horsedetails a[href]").forEach((a) => {
              const m = a.getAttribute("href").match(/horse\/(\d+)\/(.+)/);
              if (m && !seen.has(m[1])) {
                seen.add(m[1]);
                links.push({
                  horseId: m[1],
                  horseSlug: m[2],
                  url: `https://maltaracingclub.com/horse/${m[1]}/${m[2]}`,
                });
              }
            });
            return links;
          },
        });

        const total = horseLinks?.length ?? 0;
        await sendProgress(senderTabId, { event: "profiles-start", total });

        const horseProfiles = [];
        for (let i = 0; i < total; i++) {
          const link = horseLinks[i];
          await new Promise((resolve) =>
            chrome.tabs.update(bgTab.id, { url: link.url }, resolve)
          );
          await waitForTabLoad(bgTab.id);

          const [{ result: profileHtml }] = await chrome.scripting.executeScript({
            target: { tabId: bgTab.id },
            func: () => document.documentElement.outerHTML,
          });

          horseProfiles.push({
            horseId: link.horseId,
            horseSlug: link.horseSlug,
            html: profileHtml,
          });

          await sendProgress(senderTabId, { event: "profile-done", index: i + 1, total });
        }

        await sendProgress(senderTabId, { event: "analysing" });

        const res = await fetch(`${APP}/api/race-analyser`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ raceHtml, horseProfiles }),
        });

        const result = await res.json();

        if (!res.ok) {
          await sendProgress(senderTabId, {
            event: "analyse-error",
            message: result.error || `HTTP ${res.status}`,
          });
        } else {
          await sendProgress(senderTabId, { event: "analyse-done", result });
        }
      } catch (e) {
        await sendProgress(senderTabId, { event: "analyse-error", message: e.message });
      } finally {
        chrome.tabs.remove(bgTab.id);
      }
    })();
  }
});
