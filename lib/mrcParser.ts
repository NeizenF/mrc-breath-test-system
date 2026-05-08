export type ParsedEntry = {
  gate: number;
  horse_name: string;
  driver_name_raw: string | null;
  scratched: boolean;
};

export function decodeHtml(text: string) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

export function stripTags(html: string) {
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

export function normalizeSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function parseRaceNumber(html: string, text: string): number | null {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch) {
    const t = titleMatch[1];
    const m = t.match(/Race\s+(\d+)/i) || t.match(/(\d+)/);
    if (m) return Number(m[1]);
  }
  const match =
    text.match(/Meeting\s+\d+\s*-\s*Race\s+(\d+)/i) ||
    text.match(/Race\s+No\.?\s*(\d+)/i) ||
    text.match(/Race\s+#\s*(\d+)/i) ||
    text.match(/\bRace\s+(\d+)\b/i) ||
    text.match(/\bRACE\s+(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

export function cleanDriverName(value: string | null): string | null {
  if (!value) return null;
  let v = normalizeSpaces(value);
  v = v.replace(/^Driver:\s*/i, "").trim();
  v = v.replace(/\s{2,}/g, " ").trim();
  if (!v) return null;
  if (/NOT DECLARED/i.test(v)) return null;
  if (/SCRATCHED/i.test(v)) return null;
  return v;
}

export function parseEntriesFromText(text: string): ParsedEntry[] {
  const cleaned = text.replace(/\r/g, "");
  const startRegex =
    /(?:^|\n)\s*(\d+)\s+(.+?)\s*-\s*\([A-Z]{2,3}\)\s*-\s*[A-Z]\/\d+yrs/gi;

  const starts: Array<{ index: number; gate: number; horse_name: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = startRegex.exec(cleaned)) !== null) {
    starts.push({ index: match.index, gate: Number(match[1]), horse_name: normalizeSpaces(match[2]) });
  }

  const entries: ParsedEntry[] = [];
  for (let i = 0; i < starts.length; i++) {
    const current = starts[i];
    const next = starts[i + 1];
    const block = cleaned.slice(current.index, next ? next.index : cleaned.length);

    let scratched =
      /(?:^|\n)\s*SCRATCHED\s*(?:\n|$)/i.test(block) || /\bSCRATCHED\b/i.test(block);

    let driver_name_raw: string | null = null;
    if (!scratched) {
      const driverMatch = block.match(/Driver:\s*([^\n]+)/i);
      if (driverMatch?.[1]) {
        const driverText = normalizeSpaces(driverMatch[1]);
        if (/SCRATCHED/i.test(driverText)) {
          scratched = true;
        } else {
          driver_name_raw = cleanDriverName(driverMatch[1]);
        }
      }
    }

    entries.push({ gate: current.gate, horse_name: current.horse_name, driver_name_raw, scratched });
  }
  return entries;
}

export function parseRaceTime(text: string): string | null {
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
    if (match?.[1]) return normalizeSpaces(match[1]).replace(/\./g, ":");
  }
  return null;
}

export function parseRaceDistance(text: string): string | null {
  const cleaned = text.replace(/\r/g, "");
  const patterns = [
    /\bDistance:\s*(\d{3,5}\s*(?:m|metres?))\b/i,
    /\bDistance\s*[:\-]?\s*(\d{3,5}\s?m)\b/i,
    /\b(\d{3,5}\s?m)\b/i,
  ];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match?.[1]) return normalizeSpaces(match[1]).replace(/metres?/i, "m").replace(/\s*m$/i, "m");
  }
  return null;
}

export function parseRaceClass(text: string): string | null {
  const cleaned = text.replace(/\r/g, "");
  const patterns = [
    /\bClass\s+([A-Za-z0-9+\- ]{1,50})/i,
    /\bClass\s*[:\-]?\s*([A-Za-z0-9+\- ]{1,50})/i,
    /\bCategory\s*[:\-]?\s*([A-Za-z0-9+\- ]{1,50})/i,
  ];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match?.[1]) {
      const value = normalizeSpaces(match[1]).split("\n")[0].trim().replace(/[|•]+$/g, "").trim();
      if (value) return value;
    }
  }
  return null;
}

export function parseRaceName(text: string): string | null {
  const cleaned = text.replace(/\r/g, "");
  const m = cleaned.match(
    /^[ \t]*([^\n]{5,120}(?:heat|semi[\s-]?final|final|championship|qualifier|trophy|cup|plate)[^\n]{0,80})$/mi
  );
  if (m?.[1]) return normalizeSpaces(m[1]).trim();
  return null;
}

export function parseQualifiers(text: string): { count: number; nextStage: string } | null {
  const cleaned = text.replace(/\r/g, "");
  const m = cleaned.match(/(\d+)\s+to\s+Qualify(?:\s+for\s+(.+?))?[\r\n]/i);
  if (m?.[1]) return { count: parseInt(m[1]), nextStage: normalizeSpaces(m[2] ?? "").trim() };
  return null;
}
