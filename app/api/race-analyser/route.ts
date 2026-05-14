import { NextRequest, NextResponse } from "next/server";
import { parse } from "node-html-parser";

// ── Types ─────────────────────────────────────────────────────────────────────

type LastPerf = {
  date: string;
  class: string;
  driverAbbr: string;
  place: string;
  timePerKm: string;
  distance: string;
};

type YearStat = {
  year: string;
  starts: number;
  first: number;
  second: number;
  third: number;
  fourth: number;
  np: number;
  dis: number;
};

type HistoryEntry = {
  meetingDate: string;
  raceClass: string;
  raceType: string;
  distance: string;
  driver: string;
  position: string;
  time: string;
};

type HorseProfile = {
  foreignCareer: string;
  yearStats: YearStat[];
  raceHistory: HistoryEntry[];
};

type HorseEntry = {
  gate: number;
  horseName: string;
  horseId: string;
  horseSlug: string;
  country: string;
  sex: string;
  age: string;
  sire: string;
  dam: string;
  owner: string;
  points: number;
  lastPerfs: LastPerf[];
  todayDriver: string;
  profile: HorseProfile | null;
};

// ── Fetch helpers ─────────────────────────────────────────────────────────────

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.5",
  Referer: "https://maltaracingclub.com/",
};

async function fetchMRC(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

// ── HTML parsing helpers ──────────────────────────────────────────────────────

function splitBr(node: ReturnType<typeof parse> | null): string[] {
  if (!node) return [];
  return (node.innerHTML ?? "")
    .split(/<br\s*\/?>/i)
    .map((s) =>
      s
        .replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&nbsp;/g, " ")
        .replace(/\(QR\)/g, "")
        .trim()
    )
    .filter(Boolean);
}

// ── Parse race page ───────────────────────────────────────────────────────────

function parseRacePage(html: string) {
  const root = parse(html);

  const titleText = root.querySelector("title")?.text?.trim() ?? "";
  const raceInfoEl = root.querySelector("table.raceinformation");
  const raceInfoText = raceInfoEl?.text ?? "";

  const classMatch = raceInfoText.match(/Class\s+(\w+)/);
  const distMatch = raceInfoText.match(/(\d+)\s*Metres/);
  const raceClass = classMatch?.[1] ?? "";
  const distance = parseInt(distMatch?.[1] ?? "0");
  const raceName = root.querySelector("h1.racename")?.text?.trim() ?? "";

  const infoHtml = raceInfoEl?.innerHTML ?? "";
  const dateMatch = infoHtml.match(/Time:<\/small>\s*([^<\n]+)/);
  const dateStr = dateMatch?.[1]?.trim() ?? "";

  const typeMatch = raceInfoText.match(/(Autostart|Voltestart)/i);
  const raceType = typeMatch?.[1] ?? "";

  const horses: HorseEntry[] = [];

  root.querySelectorAll("td.horsenumber").forEach((cell) => {
    const gate = parseInt(cell.text.trim());
    const row = cell.parentNode;
    const tds = row.querySelectorAll("td");
    if (tds.length < 9) return;

    // td[0]=gate, td[1]=details, td[2]=points, td[3..8]=perf columns
    const detailsEl = tds[1];
    const linkEl = detailsEl?.querySelector("a");
    const horseName = linkEl?.text?.trim() ?? "";
    const href = linkEl?.getAttribute("href") ?? "";
    const hm = href.match(/horse\/(\d+)\/(.+)/);
    const horseId = hm?.[1] ?? "";
    const horseSlug = hm?.[2] ?? "";

    const smallEl = detailsEl?.querySelector("small");
    const smallLines = (smallEl?.text ?? "")
      .split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const siredamStr = smallLines[0] ?? "";
    const owner = smallLines[1] ?? "";
    const dashIdx = siredamStr.indexOf(" / ");
    const sire = dashIdx >= 0 ? siredamStr.slice(0, dashIdx).trim() : siredamStr;
    const dam = dashIdx >= 0 ? siredamStr.slice(dashIdx + 3).trim() : "";

    const detailsText = detailsEl?.text ?? "";
    const infoM = detailsText.match(/\(([A-Z]{2,3})\)\s*-\s*([GMF])\/(\d+yrs)/);

    const points = parseInt(tds[2]?.text?.trim() ?? "0");

    const dates = splitBr(tds[3]);
    const classes = splitBr(tds[4]);
    const driversAbbr = splitBr(tds[5]);
    const places = splitBr(tds[6]);
    const times = splitBr(tds[7]);
    const distances = splitBr(tds[8]);

    const lastPerfs: LastPerf[] = dates.map((date, i) => ({
      date: date.trim(),
      class: classes[i] ?? "",
      driverAbbr: driversAbbr[i] ?? "",
      place: places[i] ?? "",
      timePerKm: times[i] ?? "",
      distance: distances[i] ?? "",
    }));

    const driverRow = row.nextElementSibling;
    const todayDriver = driverRow?.querySelector("a")?.text?.trim() ?? "";

    horses.push({
      gate,
      horseName,
      horseId,
      horseSlug,
      country: infoM?.[1] ?? "",
      sex: infoM?.[2] ?? "",
      age: infoM?.[3] ?? "",
      sire,
      dam,
      owner,
      points,
      lastPerfs,
      todayDriver,
      profile: null,
    });
  });

  return { titleText, raceClass, distance, raceName, dateStr, raceType, horses };
}

// ── Parse horse profile ───────────────────────────────────────────────────────

function parseHorseProfile(html: string): HorseProfile {
  const root = parse(html);

  const detailsText = root.querySelector(".horsedetails")?.text ?? "";
  const foreignMatch = detailsText.match(/Foreign Career:\s*([\s\S]+?)(?:Currently|$)/);
  const foreignCareer = foreignMatch?.[1]?.replace(/\s+/g, " ").trim() ?? "";

  const tables = root.querySelectorAll(".statisticstable");

  const yearStats: YearStat[] = [];
  if (tables[0]) {
    tables[0].querySelectorAll("tr").forEach((row, i) => {
      if (i === 0) return;
      const c = row.querySelectorAll("td");
      if (c.length < 8) return;
      yearStats.push({
        year: c[0].text.trim(),
        starts: parseInt(c[1].text) || 0,
        first: parseInt(c[2].text) || 0,
        second: parseInt(c[3].text) || 0,
        third: parseInt(c[4].text) || 0,
        fourth: parseInt(c[5].text) || 0,
        np: parseInt(c[6].text) || 0,
        dis: parseInt(c[7].text) || 0,
      });
    });
  }

  const raceHistory: HistoryEntry[] = [];
  const histTable = tables[tables.length - 1];
  if (histTable && tables.length > 1) {
    histTable.querySelectorAll("tr").forEach((row, i) => {
      if (i === 0) return;
      const c = row.querySelectorAll("td");
      if (c.length < 7) return;
      raceHistory.push({
        meetingDate: c[0].text.trim(),
        raceClass: c[2].text.trim(),
        raceType: c[3].text.trim(),
        distance: c[4].text.trim(),
        driver: c[5].text.trim().replace(/\(QR\)/g, "").trim(),
        position: c[6].text.trim(),
        time: c[7]?.text.trim() ?? "",
      });
    });
  }

  return { foreignCareer, yearStats, raceHistory };
}

// ── Gemini analysis ───────────────────────────────────────────────────────────

async function callGemini(prompt: string): Promise<string> {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("GOOGLE_API_KEY not set");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 3000 },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

function buildPrompt(
  race: ReturnType<typeof parseRacePage>,
  horses: HorseEntry[]
): string {
  const classOrder: Record<string, number> = {
    Premier: 1, Gold: 2, Silver: 3, Bronze: 4, Copper: 5,
  };

  const horseSection = horses
    .map((h) => {
      const perfStr = h.lastPerfs
        .map(
          (p) =>
            `  ${p.date} | ${p.class} | ${p.distance} | ${p.driverAbbr} | Pos: ${p.place || "?"} | Time/km: ${p.timePerKm || "—"}`
        )
        .join("\n");

      const yearSummary = h.profile?.yearStats
        .map(
          (y) =>
            `${y.year}: ${y.starts} starts, ${y.first}W/${y.second}P/${y.third}/${y.fourth}, ${y.dis} DIS`
        )
        .join(" | ") ?? "No data";

      const recentHistory = h.profile?.raceHistory
        .slice(0, 8)
        .map(
          (r) =>
            `  ${r.meetingDate} | ${r.raceClass} | ${r.distance} | ${r.driver} | Pos: ${r.position} | Time: ${r.time || "—"}`
        )
        .join("\n") ?? "No data";

      const lastClass = h.lastPerfs[0]?.class ?? "";
      const classDropNote =
        lastClass &&
        (classOrder[lastClass] ?? 99) < (classOrder[race.raceClass] ?? 99)
          ? ` ⚠️ Class drop: was in ${lastClass}, now racing in ${race.raceClass}`
          : "";

      return `
Gate ${h.gate} — ${h.horseName} (${h.sex}/${h.age}, ${h.country}) | Points: ${h.points}${classDropNote}
Sire: ${h.sire} / Dam: ${h.dam} | Owner: ${h.owner}
Driver today: ${h.todayDriver}
Foreign career: ${h.profile?.foreignCareer || "None recorded"}
Year stats: ${yearSummary}
Last 3 on race card:
${perfStr || "  No recent data"}
Full recent history (latest first):
${recentHistory}`;
    })
    .join("\n\n---\n");

  return `You are an expert harness racing tipster with deep knowledge of Maltese trotting races.

RACE DETAILS
============
${race.titleText}
Class: ${race.raceClass} | Distance: ${race.distance}m | Start type: ${race.raceType}
Date: ${race.dateStr}
Race name: ${race.raceName}
Field size: ${horses.length} runners

IMPORTANT CONTEXT
=================
- Classes (best to worst): Premier > Gold > Silver > Bronze > Copper
- A horse dropping from a HIGHER class (e.g. Bronze → Copper) gets EASIER competition — strong positive signal
- Time/km format: 1'16"4 = 1 min 16.4 seconds per km. LOWER = FASTER. Compare only at same distances.
- DIS = Disqualified (horse broke pace / galloped). High DIS rate = reliability risk.
- NP = Not placed. Points accumulate per finish position in class — higher points = more experienced within class.
- Autostart = standing start from barrier. Gate draw matters less than in mobile starts.
- Pay attention to driver consistency — same driver over multiple meetings is a good sign.
- Recent form (last 2-3 races) is more predictive than older data.

RUNNERS DATA
============
${horseSection}

YOUR TASK
=========
1. **Predicted Finish Order** — rank all ${horses.length} horses from most likely winner to last. Be specific.
2. **Top 3 Analysis** — for your top 3 picks, explain WHY with data references (speed, form, class, driver).
3. **Key Race Factors** — 3-5 bullet points about the decisive factors in this race.
4. **Risks / To Watch** — flag any horses that could surprise or disappoint, and why.
5. **Betting Summary** — one sentence each for Win, Place (top 3), and an Each-Way pick.

Be concise, data-driven, and confident. Reference actual times and positions from the data.`;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let race: ReturnType<typeof parseRacePage>;

    if (body.raceHtml && Array.isArray(body.horseProfiles)) {
      // Extension mode: HTML already fetched by real browser (bypasses Cloudflare)
      race = parseRacePage(body.raceHtml);

      if (race.horses.length === 0) {
        return NextResponse.json(
          { error: "No horses found in the race page HTML." },
          { status: 422 }
        );
      }

      for (const h of race.horses) {
        const profileData = (body.horseProfiles as { horseId: string; html: string }[])
          .find((p) => p.horseId === h.horseId);
        if (profileData?.html) h.profile = parseHorseProfile(profileData.html);
      }
    } else {
      // Direct URL mode (may be blocked by Cloudflare — use extension instead)
      const url: string = body.url ?? "";

      if (!url.includes("maltaracingclub.com/race.php")) {
        return NextResponse.json(
          { error: "Please paste a valid MRC race URL (maltaracingclub.com/race.php?id=...)" },
          { status: 400 }
        );
      }

      const raceHtml = await fetchMRC(url);
      race = parseRacePage(raceHtml);

      if (race.horses.length === 0) {
        return NextResponse.json(
          { error: "No horses found — the page may have changed or the URL is not a race page." },
          { status: 422 }
        );
      }

      const BATCH = 3;
      for (let i = 0; i < race.horses.length; i += BATCH) {
        const batch = race.horses.slice(i, i + BATCH);
        const profiles = await Promise.all(
          batch.map((h) =>
            fetchMRC(`https://maltaracingclub.com/horse/${h.horseId}/${h.horseSlug}`)
              .then(parseHorseProfile)
              .catch(() => null)
          )
        );
        batch.forEach((h, j) => { h.profile = profiles[j]; });
      }
    }

    // Call Gemini
    let analysis = "";
    let analysisError = "";
    try {
      analysis = await callGemini(buildPrompt(race, race.horses));
    } catch (e: unknown) {
      analysisError = e instanceof Error ? e.message : String(e);
    }

    return NextResponse.json({
      race: {
        titleText: race.titleText,
        raceClass: race.raceClass,
        distance: race.distance,
        raceName: race.raceName,
        dateStr: race.dateStr,
        raceType: race.raceType,
      },
      horses: race.horses,
      analysis,
      analysisError,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
