const APP = "https://mrc-breath-test-system.vercel.app";

function render(html) {
  document.getElementById("root").innerHTML = html;
}

function msg(text, type = "info") {
  return `<div class="msg ${type}">${text}</div>`;
}

function isMrcHost(url) {
  try {
    const h = new URL(url).hostname;
    return h === "maltaracingclub.com" || h === "www.maltaracingclub.com";
  } catch { return false; }
}

function isMeetingPage(url) {
  try { return new URL(url).pathname.includes("meeting.php"); }
  catch { return false; }
}

function formatDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

async function getToken() {
  const cached = await chrome.storage.session.get("mrc_token");
  if (cached.mrc_token) return cached.mrc_token;

  const appTabs = await chrome.tabs.query({ url: APP + "/*" });
  if (!appTabs.length) return null;

  const results = await chrome.scripting.executeScript({
    target: { tabId: appTabs[0].id },
    func: () => {
      const key = Object.keys(localStorage).find(
        k => k.startsWith("sb-") && k.endsWith("-auth-token")
      );
      if (!key) return null;
      try { return JSON.parse(localStorage.getItem(key) || "{}")?.access_token ?? null; }
      catch { return null; }
    },
  });

  const token = results?.[0]?.result ?? null;
  if (token) await chrome.storage.session.set({ mrc_token: token });
  return token;
}

// Extract race URLs from a meeting page DOM
function extractRaceUrlsFromPage() {
  const divs = document.querySelectorAll(".race[onclick]");
  const urls = [];
  divs.forEach(div => {
    const match = div.getAttribute("onclick").match(/race\.php\?id=(\d+)/);
    if (match) urls.push(`https://maltaracingclub.com/race.php?id=${match[1]}`);
  });
  return urls;
}

// Wait for a tab to finish navigating
function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    let navigating = false;
    const listener = (id, changeInfo) => {
      if (id !== tabId) return;
      if (changeInfo.status === "loading") navigating = true;
      if (navigating && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function getHtmlFromTab(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => document.documentElement.outerHTML,
  });
  return result;
}

async function callFullImport(html, meetingId, token) {
  const res = await fetch(`${APP}/api/mrc-full-import`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ html, meetingId }),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Import failed.");
  return result;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!isMrcHost(tab.url)) {
    render(msg("Navigate to an MRC meeting or race page first."));
    return;
  }

  render(msg("Loading…"));

  const token = await getToken();
  if (!token) {
    render(msg(`Please open the <a href="${APP}" target="_blank">MRC System</a> in another tab and make sure you're logged in, then try again.`, "err"));
    return;
  }

  // Fetch meetings list
  let meetings = [];
  try {
    const res = await fetch(`${APP}/api/meetings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      await chrome.storage.session.remove("mrc_token");
      render(msg(`Session expired — reload the <a href="${APP}" target="_blank">MRC System</a> and try again.`, "err"));
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    meetings = (await res.json()).meetings || [];
  } catch (e) {
    render(msg(`Could not load meetings: ${e.message}`, "err"));
    return;
  }

  if (!meetings.length) {
    render(msg("No meetings found. Create one in the app first."));
    return;
  }

  const options = meetings
    .map(m => `<option value="${m.id}">${m.title || "Meeting " + formatDate(m.meeting_date)}</option>`)
    .join("");

  const onMeetingPage = isMeetingPage(tab.url);

  if (onMeetingPage) {
    // Extract race URLs from this meeting page
    const [{ result: raceUrls }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractRaceUrlsFromPage,
    });

    if (!raceUrls || raceUrls.length === 0) {
      render(msg("No races found on this page."));
      return;
    }

    render(`
      <select id="meeting">${options}</select>
      <button id="btn">Import all ${raceUrls.length} races</button>
      <div id="log"></div>
    `);

    document.getElementById("btn").addEventListener("click", async () => {
      const meetingId = document.getElementById("meeting").value;
      const btn = document.getElementById("btn");
      const log = document.getElementById("log");

      btn.disabled = true;
      log.innerHTML = msg("Opening background tab…");

      // Open a background tab with the first race URL
      const bgTab = await new Promise(resolve =>
        chrome.tabs.create({ url: "about:blank", active: false }, resolve)
      );

      let logHtml = "";
      const addLog = (line, type = "info") => {
        logHtml += `<div class="msg ${type}" style="margin-top:6px">${line}</div>`;
        log.innerHTML = logHtml;
      };

      try {
        for (let i = 0; i < raceUrls.length; i++) {
          const url = raceUrls[i];
          btn.textContent = `Importing… (${i + 1}/${raceUrls.length})`;

          await new Promise(resolve => chrome.tabs.update(bgTab.id, { url }, resolve));
          await waitForTabLoad(bgTab.id);

          try {
            const html = await getHtmlFromTab(bgTab.id);
            const result = await callFullImport(html, meetingId, token);
            addLog(`✓ Race ${result.raceNumber} — ${result.importedCount} entries`, "ok");
          } catch (e) {
            addLog(`✗ Race ${i + 1}: ${e.message}`, "err");
          }
        }
      } finally {
        chrome.tabs.remove(bgTab.id);
        btn.textContent = "Done";
      }
    });

  } else {
    // Race page — import just this race
    render(`
      <select id="meeting">${options}</select>
      <button id="btn">Import this race</button>
      <div id="status"></div>
    `);

    document.getElementById("btn").addEventListener("click", async () => {
      const meetingId = document.getElementById("meeting").value;
      const btn = document.getElementById("btn");
      const statusEl = document.getElementById("status");

      btn.disabled = true;
      btn.textContent = "Importing…";
      statusEl.innerHTML = "";

      try {
        const html = await getHtmlFromTab(tab.id);
        const result = await callFullImport(html, meetingId, token);
        statusEl.innerHTML = msg(`✓ Race ${result.raceNumber} — ${result.importedCount} entries`, "ok");
        btn.textContent = "Import another race";
        btn.disabled = false;
      } catch (e) {
        statusEl.innerHTML = msg(`✗ ${e.message}`, "err");
        btn.textContent = "Import this race";
        btn.disabled = false;
      }
    });
  }
}

main();
