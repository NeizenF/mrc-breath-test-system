const APP = "https://mrc-breath-test-system.vercel.app";

function render(html) {
  document.getElementById("root").innerHTML = html;
}

function msg(text, type = "info") {
  return `<div class="msg ${type}">${text}</div>`;
}

function isOnMrcPage(url) {
  try {
    const h = new URL(url).hostname;
    return h === "maltaracingclub.com" || h === "www.maltaracingclub.com";
  } catch {
    return false;
  }
}

function formatDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

async function getToken() {
  // 1. Try cached token
  const cached = await chrome.storage.session.get("mrc_token");
  if (cached.mrc_token) return cached.mrc_token;

  // 2. Try to extract from app tab (if open)
  const appTabs = await chrome.tabs.query({ url: APP + "/*" });
  if (appTabs.length === 0) return null;

  const results = await chrome.scripting.executeScript({
    target: { tabId: appTabs[0].id },
    func: () => {
      const key = Object.keys(localStorage).find(
        (k) => k.startsWith("sb-") && k.endsWith("-auth-token")
      );
      if (!key) return null;
      try {
        return JSON.parse(localStorage.getItem(key) || "{}")?.access_token ?? null;
      } catch {
        return null;
      }
    },
  });

  const token = results?.[0]?.result ?? null;
  if (token) await chrome.storage.session.set({ mrc_token: token });
  return token;
}

async function main() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!isOnMrcPage(tab.url)) {
    render(msg("Navigate to an MRC race page first."));
    return;
  }

  render(msg("Loading…"));

  const token = await getToken();
  if (!token) {
    render(msg(
      `Please open the <a href="${APP}" target="_blank">MRC System</a> in another tab and make sure you're logged in, then come back here.`,
      "err"
    ));
    return;
  }

  // Fetch meetings
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

  if (meetings.length === 0) {
    render(msg("No meetings found. Create one in the app first."));
    return;
  }

  const options = meetings
    .map((m) => {
      const label = m.title || `Meeting ${formatDate(m.meeting_date)}`;
      return `<option value="${m.id}">${label}</option>`;
    })
    .join("");

  render(`
    <select id="meeting">${options}</select>
    <button id="btn">Import race</button>
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
      // Read HTML from the active MRC tab
      const [{ result: html }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
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

      statusEl.innerHTML = msg(
        `✓ Race ${result.raceNumber} — ${result.importedCount} entries imported`,
        "ok"
      );
      btn.textContent = "Import another race";
      btn.disabled = false;
    } catch (e) {
      statusEl.innerHTML = msg(`✗ ${e.message}`, "err");
      btn.textContent = "Import race";
      btn.disabled = false;
    }
  });
}

main();
