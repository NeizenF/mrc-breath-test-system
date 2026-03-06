import { NextResponse } from "next/server";

type ParsedEntry = {
  gate: number;
  horse_name: string;
  driver_name_raw: string | null;
  scratched: boolean;
};

function decodeHtml(text: string) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(html: string) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/tr>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/td>/gi, " ")
      .replace(/<[^>]+>/g, "")
  );
}

function normalizeSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseRaceNumber(text: string): number | null {
  const match =
    text.match(/Meeting\s+\d+\s*-\s*Race\s+(\d+)/i) ||
    text.match(/\bRACE\s+(\d+)\b/i);

  return match ? Number(match[1]) : null;
}

function cleanDriverName(value: string | null): string | null {
  if (!value) return null;

  let v = normalizeSpaces(value);

  v = v.replace(/^Driver:\s*/i, "").trim();
  v = v.replace(/\s{2,}/g, " ").trim();

  if (!v) return null;
  if (/NOT DECLARED/i.test(v)) return null;
  if (/SCRATCHED/i.test(v)) return null;

  return v;
}

function parseEntriesFromText(text: string): ParsedEntry[] {
  const cleaned = text.replace(/\r/g, "");

  const startRegex =
    /(?:^|\n)\s*(\d+)\s+(.+?)\s*-\s*\([A-Z]{2,3}\)\s*-\s*[A-Z]\/\d+yrs/gi;

  const starts: Array<{
    index: number;
    gate: number;
    horse_name: string;
  }> = [];

  let match: RegExpExecArray | null;

  while ((match = startRegex.exec(cleaned)) !== null) {
    starts.push({
      index: match.index,
      gate: Number(match[1]),
      horse_name: normalizeSpaces(match[2]),
    });
  }

  const entries: ParsedEntry[] = [];

  for (let i = 0; i < starts.length; i++) {
    const current = starts[i];
    const next = starts[i + 1];

    const block = cleaned.slice(
      current.index,
      next ? next.index : cleaned.length
    );

    const scratched =
      /(?:^|\n)\s*SCRATCHED\s*(?:\n|$)/i.test(block) ||
      /\bSCRATCHED\b/i.test(block);

    let driver_name_raw: string | null = null;

    if (!scratched) {
      const driverMatch = block.match(/Driver:\s*([^\n]+)/i);

      if (driverMatch?.[1]) {
        driver_name_raw = cleanDriverName(driverMatch[1]);
      }
    }

    entries.push({
      gate: current.gate,
      horse_name: current.horse_name,
      driver_name_raw,
      scratched,
    });
  }

  return entries;
}

function parseRaceTime(text: string): string | null {
  const cleaned = text.replace(/\r/g, "");

  const patterns = [
    /\bTime:\s*([^\n]+)/i,
    /\bStart\s*Time\s*[:\-]?\s*([0-2]?\d[:.][0-5]\d(?:\s*[ap]m)?)\b/i,
    /\bRace\s*Time\s*[:\-]?\s*([0-2]?\d[:.][0-5]\d(?:\s*[ap]m)?)\b/i,
    /\b([0-2]?\d[:.][0-5]\d(?:\s*[ap]m))\b/i,
    /\b([0-2]?\d[:.][0-5]\d)\b/,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match?.[1]) {
      return normalizeSpaces(match[1]).replace(/\./g, ":");
    }
  }

  return null;
}

function parseRaceDistance(text: string): string | null {
  const cleaned = text.replace(/\r/g, "");

  const patterns = [
    /\bDistance:\s*(\d{3,5}\s*(?:m|metres?))\b/i,
    /\bDistance\s*[:\-]?\s*(\d{3,5}\s?m)\b/i,
    /\b(\d{3,5}\s?m)\b/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match?.[1]) {
      return normalizeSpaces(match[1])
        .replace(/metres?/i, "m")
        .replace(/\s*m$/i, "m");
    }
  }

  return null;
}

function parseRaceClass(text: string): string | null {
  const cleaned = text.replace(/\r/g, "");

  const patterns = [
    /\bClass\s+([A-Za-z0-9+\- ]{1,50})/i,
    /\bClass\s*[:\-]?\s*([A-Za-z0-9+\- ]{1,50})/i,
    /\bCategory\s*[:\-]?\s*([A-Za-z0-9+\- ]{1,50})/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match?.[1]) {
      const value = normalizeSpaces(match[1])
        .split("\n")[0]
        .trim()
        .replace(/[|•]+$/g, "")
        .trim();

      if (value) return value;
    }
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { url } = body as { url?: string };

    if (!url) {
      return NextResponse.json({ error: "Missing URL." }, { status: 400 });
    }

    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language": "en-GB,en;q=0.9",
        referer: "https://maltaracingclub.com/",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch MRC page: ${response.status}` },
        { status: 400 }
      );
    }

    const html = await response.text();
    const text = stripTags(html);

    const race_number = parseRaceNumber(text);
    const race_time = parseRaceTime(text);
    const race_distance = parseRaceDistance(text);
    const race_class = parseRaceClass(text);
    const entries = parseEntriesFromText(text);

    return NextResponse.json({
      race_number,
      race_time,
      race_distance,
      race_class,
      entries,
      count: entries.length,
      finalUrl: response.url,
      preview: text.slice(0, 2000),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed." },
      { status: 500 }
    );
  }
}