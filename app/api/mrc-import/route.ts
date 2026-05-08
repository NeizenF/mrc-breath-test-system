import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  stripTags,
  parseRaceNumber,
  parseRaceTime,
  parseRaceDistance,
  parseRaceClass,
  parseRaceName,
  parseQualifiers,
  parseEntriesFromText,
} from "@/lib/mrcParser";

// Simple in-memory rate limiter (resets on cold start)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

const ALLOWED_HOSTNAMES = ["maltaracingclub.com", "www.maltaracingclub.com"];

export async function POST(req: Request) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment." },
        { status: 429 }
      );
    }

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await req.json();
    const { url, html: pastedHtml } = body as { url?: string; html?: string };

    let html: string;

    if (pastedHtml) {
      if (pastedHtml.trim().length < 100) {
        return NextResponse.json({ error: "Pasted HTML is too short to be valid." }, { status: 400 });
      }
      html = pastedHtml;
    } else if (url) {
      try {
        const parsed = new URL(url);
        if (!ALLOWED_HOSTNAMES.includes(parsed.hostname)) {
          return NextResponse.json(
            { error: "Only Malta Racing Club URLs are accepted." },
            { status: 400 }
          );
        }
      } catch {
        return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
      }

      const response = await fetch(url, {
        cache: "no-store",
        redirect: "follow",
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-GB,en;q=0.9",
        },
      });

      if (!response.ok) {
        return NextResponse.json(
          { error: `Failed to fetch MRC page: ${response.status}` },
          { status: 400 }
        );
      }

      html = await response.text();
    } else {
      return NextResponse.json({ error: "Provide either a URL or pasted HTML." }, { status: 400 });
    }

    const text = stripTags(html);

    if (/does not exist in our database/i.test(text)) {
      return NextResponse.json(
        { error: "Race not found on the MRC website. The URL may be outdated — grab a fresh link from maltaracingclub.com." },
        { status: 400 }
      );
    }

    const race_number = parseRaceNumber(html, text);
    const race_time = parseRaceTime(text);
    const race_distance = parseRaceDistance(text);
    const race_class = parseRaceClass(text);
    const race_name = parseRaceName(text);
    const qualifiers = parseQualifiers(text);
    const entries = parseEntriesFromText(text);

    return NextResponse.json({
      race_number,
      race_time,
      race_distance,
      race_class,
      race_name,
      qualifiers,
      entries,
      count: entries.length,
      finalUrl: pastedHtml ? null : (url ?? null),
      preview: text.slice(0, 3000),
      debug_race_number_found: race_number !== null,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed." },
      { status: 500 }
    );
  }
}
