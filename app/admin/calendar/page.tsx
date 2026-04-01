"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, Trash2, Plus, X } from "lucide-react";

type CalendarEntry = {
  id: string;
  meeting_number: number;
  meeting_date: string;
  premier: string;
  gold: string;
  silver: string;
  bronze: string;
  copper: string;
  dist_for_normal: number | null;
  work_status: string | null;
  notes: string | null;
};

type EditForm = Omit<CalendarEntry, "id">;

const BLANK_FORM: EditForm = {
  meeting_number: 0,
  meeting_date: "",
  premier: "NORMAL",
  gold: "NORMAL",
  silver: "NORMAL",
  bronze: "NORMAL",
  copper: "NORMAL",
  dist_for_normal: null,
  work_status: "",
  notes: "",
};

const SEED_DATA: EditForm[] = [
  { meeting_number: 1,  meeting_date: "2026-01-17", premier: "NORMAL",                       gold: "NORMAL",                       silver: "NORMAL",                       bronze: "NORMAL",                          copper: "NORMAL",                       dist_for_normal: 2140, work_status: "WORK",     notes: "" },
  { meeting_number: 2,  meeting_date: "2026-01-18", premier: "GRAND FINAL 2160M",             gold: "GRAND FINAL 2160M",             silver: "GRAND FINAL 2160M",             bronze: "GRAND FINAL 2160M",               copper: "GRAND FINAL 2160M",             dist_for_normal: 2140, work_status: "NO WORK",  notes: "France Travel" },
  { meeting_number: 3,  meeting_date: "2026-01-25", premier: "NORMAL",                       gold: "ASSIKURA 2140 H",               silver: "NORMAL",                       bronze: "NORMAL",                          copper: "NORMAL",                       dist_for_normal: 2140, work_status: "NO WORK",  notes: "France Travel" },
  { meeting_number: 4,  meeting_date: "2026-01-31", premier: "PRESIDENT 2140 H",             gold: "NORMAL",                       silver: "NORMAL",                       bronze: "NORMAL",                          copper: "NORMAL",                       dist_for_normal: 2140, work_status: "TBA",      notes: "NULL - MEETING NOT HELD" },
  { meeting_number: 5,  meeting_date: "2026-02-01", premier: "PRESIDENT 2140 H",             gold: "NORMAL",                       silver: "NORMAL",                       bronze: "NORMAL",                          copper: "NORMAL",                       dist_for_normal: 2140, work_status: "WORK",     notes: "" },
  { meeting_number: 6,  meeting_date: "2026-02-08", premier: "NORMAL",                       gold: "ASSIKURA 2140 SF",              silver: "NORMAL",                       bronze: "NORMAL",                          copper: "NORMAL",                       dist_for_normal: 2640, work_status: "NO WORK",  notes: "" },
  { meeting_number: 7,  meeting_date: "2026-02-10", premier: "NORMAL",                       gold: "NORMAL",                       silver: "NORMAL",                       bronze: "NORMAL",                          copper: "NORMAL",                       dist_for_normal: 2640, work_status: "NO WORK",  notes: "" },
  { meeting_number: 8,  meeting_date: "2026-02-15", premier: "PRESIDENT 2140 SF",            gold: "NORMAL",                       silver: "NORMAL",                       bronze: "NORMAL",                          copper: "NORMAL",                       dist_for_normal: 2640, work_status: "WORK",     notes: "" },
  { meeting_number: 9,  meeting_date: "2026-02-22", premier: "NORMAL",                       gold: "ASSIKURA 2104 F",               silver: "NORMAL",                       bronze: "NORMAL",                          copper: "NORMAL",                       dist_for_normal: 1640, work_status: "WORK",     notes: "" },
  { meeting_number: 10, meeting_date: "2026-02-28", premier: "NORMAL",                       gold: "NORMAL",                       silver: "PHONE REFIX 2140 H",           bronze: "NORMAL",                          copper: "NORMAL",                       dist_for_normal: 1640, work_status: "WORK",     notes: "" },
  { meeting_number: 11, meeting_date: "2026-03-01", premier: "PRESIDENT 2140 F",             gold: "NORMAL",                       silver: "PHONE REFIX 2140 H",           bronze: "NORMAL",                          copper: "NORMAL",                       dist_for_normal: 1640, work_status: "NO WORK",  notes: "" },
  { meeting_number: 12, meeting_date: "2026-03-08", premier: "NORMAL",                       gold: "NORMAL",                       silver: "NORMAL",                       bronze: "NORMAL",                          copper: "NORMAL",                       dist_for_normal: 2140, work_status: "NO WORK",  notes: "" },
  { meeting_number: 13, meeting_date: "2026-03-14", premier: "TAZZA L-KBIRA 2640 H",         gold: "NORMAL",                       silver: "NORMAL",                       bronze: "NORMAL",                          copper: "NORMAL",                       dist_for_normal: 2140, work_status: "NO WORK",  notes: "" },
  { meeting_number: 14, meeting_date: "2026-03-15", premier: "TAZZA L-KBIRA 2640 H",         gold: "NORMAL",                       silver: "PHONE REFIX 2140 SF",          bronze: "NORMAL",                          copper: "NORMAL",                       dist_for_normal: 2140, work_status: "WORK",     notes: "" },
  { meeting_number: 15, meeting_date: "2026-03-22", premier: "NORMAL",                       gold: "NORMAL",                       silver: "NORMAL",                       bronze: "NORMAL",                          copper: "SAN FRANGISK - GAIN 2140 H",    dist_for_normal: 2640, work_status: "WORK",     notes: "" },
  { meeting_number: 16, meeting_date: "2026-03-28", premier: "NORMAL",                       gold: "NORMAL",                       silver: "NORMAL",                       bronze: "NORMAL",                          copper: "NORMAL",                       dist_for_normal: 2640, work_status: "WORK",     notes: "" },
  { meeting_number: 17, meeting_date: "2026-03-29", premier: "TAZZA L-KBIRA 2640 SF",        gold: "NORMAL",                       silver: "PHONE REFIX 2140 F",           bronze: "NORMAL",                          copper: "NORMAL",                       dist_for_normal: 2640, work_status: "WORK",     notes: "" },
  { meeting_number: 18, meeting_date: "2026-04-04", premier: "NORMAL",                       gold: "BAVARIA 2640 H",               silver: "NORMAL",                       bronze: "NORMAL",                          copper: "SAN FRANGISK - GAIN 2140 SF",   dist_for_normal: 3140, work_status: "",         notes: "" },
  { meeting_number: 19, meeting_date: "2026-04-10", premier: "NORMAL",                       gold: "NORMAL",                       silver: "NORMAL",                       bronze: "MRTL C'SHIP 2140 H",              copper: "NORMAL",                       dist_for_normal: 3140, work_status: "",         notes: "" },
  { meeting_number: 20, meeting_date: "2026-04-12", premier: "TAZZA L-KBIRA 2640 F",         gold: "NORMAL",                       silver: "NORMAL",                       bronze: "MRTL C'SHIP 2140 H",              copper: "NORMAL",                       dist_for_normal: 3140, work_status: "",         notes: "" },
  { meeting_number: 21, meeting_date: "2026-04-19", premier: "NORMAL",                       gold: "BAVARIA 2640 SF",              silver: "MHU RACES",                    bronze: "NORMAL",                          copper: "SAN FRANGISK - GAIN 2140 F",    dist_for_normal: 2140, work_status: "",         notes: "" },
  { meeting_number: 22, meeting_date: "2026-04-24", premier: "NORMAL",                       gold: "NORMAL",                       silver: "NORMAL",                       bronze: "MRTL C'SHIP 2140 SF",             copper: "NORMAL",                       dist_for_normal: 2140, work_status: "NO WORK",  notes: "Exam" },
  { meeting_number: 23, meeting_date: "2026-04-26", premier: "LOCAL COUNCIL 2140 Q",         gold: "NORMAL",                       silver: "NORMAL",                       bronze: "NORMAL",                          copper: "NORMAL",                       dist_for_normal: 2140, work_status: "",         notes: "" },
  { meeting_number: 24, meeting_date: "2026-05-03", premier: "NORMAL",                       gold: "BAVARIA 2640 F",               silver: "NORMAL",                       bronze: "NORMAL",                          copper: "NORMAL",                       dist_for_normal: 2640, work_status: "SR",       notes: "" },
  { meeting_number: 25, meeting_date: "2026-05-08", premier: "LOCAL COUNCIL 2140 F",         gold: "NORMAL",                       silver: "NORMAL",                       bronze: "NORMAL",                          copper: "NORMAL",                       dist_for_normal: 2640, work_status: "SR",       notes: "Exam on 9th" },
  { meeting_number: 26, meeting_date: "2026-05-10", premier: "NORMAL",                       gold: "NORMAL",                       silver: "NORMAL",                       bronze: "MRTL C'SHIP 2140 F",              copper: "NORMAL",                       dist_for_normal: 2640, work_status: "SR",       notes: "Exam on 11th" },
  { meeting_number: 27, meeting_date: "2026-05-15", premier: "NORMAL",                       gold: "NORMAL",                       silver: "PRIX DE CABOURG 2140 H",       bronze: "NORMAL",                          copper: "PRIX DE CAEN 2140 H",           dist_for_normal: 2140, work_status: "",         notes: "Taliana Absent" },
  { meeting_number: 28, meeting_date: "2026-05-17", premier: "NORMAL",                       gold: "NORMAL",                       silver: "PRIX DE CABOURG 2140 H",       bronze: "NORMAL",                          copper: "PRIX DE CAEN 2140 H",           dist_for_normal: 2140, work_status: "",         notes: "Taliana Absent" },
  { meeting_number: 29, meeting_date: "2026-05-22", premier: "PRIX DE VINCENNES 2140 H",     gold: "PRIX D'ENGHIEN 2140 H",        silver: "NORMAL",                       bronze: "PRIX DE CAGNES SUR MER 2140 H",   copper: "NORMAL",                       dist_for_normal: 2140, work_status: "",         notes: "" },
  { meeting_number: 30, meeting_date: "2026-05-24", premier: "ALDB SETTE GIUNGIO 2140 H",    gold: "PRIX D'ENGHIEN 2140 H",        silver: "NORMAL",                       bronze: "PRIX DE CAGNES SUR MER 2140 H",   copper: "NORMAL",                       dist_for_normal: 2140, work_status: "",         notes: "" },
  { meeting_number: 31, meeting_date: "2026-05-31", premier: "NORMAL",                       gold: "NORMAL",                       silver: "PRIX DE CABOURG 2140 SF",      bronze: "NORMAL",                          copper: "PRIX DE CAEN 2140 SF",          dist_for_normal: 2640, work_status: "",         notes: "" },
  { meeting_number: 32, meeting_date: "2026-06-05", premier: "PRIX DE VINCENNES 2140 SF",    gold: "NORMAL",                       silver: "NORMAL",                       bronze: "NORMAL",                          copper: "NORMAL",                       dist_for_normal: 2640, work_status: "",         notes: "" },
  { meeting_number: 33, meeting_date: "2026-06-07", premier: "ALDB SETTE GIUNGIO 2140 F",    gold: "PRIX D'ENGHIEN 2140 SF",       silver: "NORMAL",                       bronze: "PRIX DE CAGNES SUR MER 2140 SF",  copper: "NORMAL",                       dist_for_normal: 2640, work_status: "",         notes: "" },
  { meeting_number: 34, meeting_date: "2026-06-14", premier: "NORMAL",                       gold: "NORMAL",                       silver: "PRIX DE CABOURG 2140 F",       bronze: "NORMAL",                          copper: "PRIX DE CAEN 2140 F",           dist_for_normal: 1640, work_status: "",         notes: "" },
  { meeting_number: 35, meeting_date: "2026-06-19", premier: "NORMAL",                       gold: "NORMAL",                       silver: "NORMAL",                       bronze: "NORMAL",                          copper: "NORMAL",                       dist_for_normal: 1640, work_status: "",         notes: "" },
  { meeting_number: 36, meeting_date: "2026-06-21", premier: "PRIX DE VINCENNES 2140 F",     gold: "PRIX D'ENGHIEN 2140 F",        silver: "NORMAL",                       bronze: "PRIX DE CAGNES SUR MER 2140 F",   copper: "NORMAL",                       dist_for_normal: 1640, work_status: "",         notes: "" },
  { meeting_number: 37, meeting_date: "2026-06-26", premier: "NORMAL",                       gold: "NORMAL",                       silver: "NORMAL",                       bronze: "NORMAL",                          copper: "NORMAL",                       dist_for_normal: 2140, work_status: "SR",       notes: "" },
  { meeting_number: 38, meeting_date: "2026-06-30", premier: "NORMAL",                       gold: "NORMAL",                       silver: "NORMAL",                       bronze: "NORMAL",                          copper: "NORMAL",                       dist_for_normal: 2140, work_status: "SR",       notes: "" },
  { meeting_number: 39, meeting_date: "2026-07-03", premier: "NORMAL",                       gold: "NORMAL",                       silver: "NORMAL",                       bronze: "NORMAL",                          copper: "NORMAL",                       dist_for_normal: 2140, work_status: "SR",       notes: "" },
  { meeting_number: 40, meeting_date: "2026-07-10", premier: "NORMAL",                       gold: "NORMAL",                       silver: "NORMAL",                       bronze: "NORMAL",                          copper: "NORMAL",                       dist_for_normal: 2640, work_status: "SR",       notes: "" },
  { meeting_number: 41, meeting_date: "2026-07-14", premier: "NORMAL",                       gold: "NORMAL",                       silver: "NORMAL",                       bronze: "NORMAL",                          copper: "NORMAL",                       dist_for_normal: 2640, work_status: "SR",       notes: "" },
  { meeting_number: 42, meeting_date: "2026-07-17", premier: "NORMAL",                       gold: "NORMAL",                       silver: "NORMAL",                       bronze: "NORMAL",                          copper: "NORMAL",                       dist_for_normal: 2640, work_status: "SR",       notes: "" },
  { meeting_number: 43, meeting_date: "2026-07-24", premier: "NORMAL",                       gold: "NORMAL",                       silver: "NORMAL",                       bronze: "NORMAL",                          copper: "NORMAL",                       dist_for_normal: 1640, work_status: "SR",       notes: "" },
  { meeting_number: 44, meeting_date: "2026-07-28", premier: "NORMAL",                       gold: "NORMAL",                       silver: "NORMAL",                       bronze: "NORMAL",                          copper: "NORMAL",                       dist_for_normal: 1640, work_status: "SR",       notes: "" },
  { meeting_number: 45, meeting_date: "2026-07-31", premier: "NORMAL",                       gold: "NORMAL",                       silver: "NORMAL",                       bronze: "NORMAL",                          copper: "NORMAL",                       dist_for_normal: 1640, work_status: "SR",       notes: "" },
  { meeting_number: 46, meeting_date: "2026-08-07", premier: "SUMMER C'SHIP 2140",           gold: "SUMMER C'SHIP 2140",           silver: "SUMMER C'SHIP 2140",           bronze: "SUMMER C'SHIP 2140",              copper: "SUMMER C'SHIP 2140",            dist_for_normal: 2140, work_status: "",         notes: "" },
];

function workBadge(status: string | null) {
  const s = (status || "").trim().toUpperCase();
  if (s === "WORK")     return <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">WORK</span>;
  if (s === "NO WORK")  return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-300">NO WORK</span>;
  if (s === "TBA")      return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300">TBA</span>;
  if (s === "SR")       return <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">SR</span>;
  return null;
}

function formatDate(d: string) {
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function dayOfWeek(d: string) {
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase();
}

function isSpecial(val: string) {
  return val.trim().toUpperCase() !== "NORMAL";
}

function stageBadgeClass(value: string) {
  const v = value.trim().toUpperCase();
  if (v.endsWith(" F") || v.endsWith(" FINAL"))   return "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300";
  if (v.endsWith(" SF"))                           return "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300";
  if (v.endsWith(" H"))                            return "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
  if (v.endsWith(" Q"))                            return "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300";
  return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

const CLASS_LABELS = ["PREMIER", "GOLD", "SILVER", "BRONZE", "COPPER"] as const;
const CLASS_KEYS = ["premier", "gold", "silver", "bronze", "copper"] as const;

export default function AdminCalendarPage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [editEntry, setEditEntry] = useState<CalendarEntry | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [form, setForm] = useState<EditForm>(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showUpcomingOnly, setShowUpcomingOnly] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;
        if (!session) { router.replace("/"); return; }
        const admin = await isCurrentUserAdmin();
        if (!mounted) return;
        if (!admin) { router.replace("/dashboard"); return; }
        setCheckingAccess(false);
        await loadEntries();
      } catch {
        router.replace("/dashboard");
      }
    }
    init();
    return () => { mounted = false; };
  }, [router]);

  async function loadEntries() {
    setLoading(true);
    const { data, error } = await supabase
      .from("race_calendar")
      .select("*")
      .order("meeting_number", { ascending: true });
    if (error) { toast.error(error.message); setLoading(false); return; }
    setEntries((data as CalendarEntry[]) || []);
    setLoading(false);
  }

  async function seedData() {
    setSeeding(true);
    const { error } = await supabase.from("race_calendar").insert(SEED_DATA);
    if (error) { toast.error(error.message); setSeeding(false); return; }
    toast.success("2026 calendar loaded successfully.");
    await loadEntries();
    setSeeding(false);
  }

  function openEdit(entry: CalendarEntry) {
    setEditEntry(entry);
    setForm({
      meeting_number: entry.meeting_number,
      meeting_date: entry.meeting_date,
      premier: entry.premier,
      gold: entry.gold,
      silver: entry.silver,
      bronze: entry.bronze,
      copper: entry.copper,
      dist_for_normal: entry.dist_for_normal,
      work_status: entry.work_status || "",
      notes: entry.notes || "",
    });
    setAddingNew(false);
  }

  function openAdd() {
    setEditEntry(null);
    setForm({ ...BLANK_FORM, meeting_number: entries.length > 0 ? Math.max(...entries.map(e => e.meeting_number)) + 1 : 1 });
    setAddingNew(true);
  }

  function closeModal() {
    setEditEntry(null);
    setAddingNew(false);
  }

  async function saveEntry() {
    if (!form.meeting_date) { toast.error("Date is required."); return; }
    setSaving(true);
    const payload = {
      ...form,
      work_status: form.work_status || null,
      notes: form.notes || null,
    };
    if (addingNew) {
      const { error } = await supabase.from("race_calendar").insert(payload);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Meeting added.");
    } else if (editEntry) {
      const { error } = await supabase.from("race_calendar").update(payload).eq("id", editEntry.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Meeting updated.");
    }
    setSaving(false);
    closeModal();
    await loadEntries();
  }

  async function confirmDelete(id: string) {
    const { error } = await supabase.from("race_calendar").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Meeting removed.");
    setDeleteId(null);
    await loadEntries();
  }

  const today = new Date().toISOString().slice(0, 10);
  const displayed = showUpcomingOnly
    ? entries.filter(e => e.meeting_date >= today)
    : entries;

  if (checkingAccess) {
    return (
      <div className="p-6">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="w-full p-4 md:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Race Calendar 2026</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {entries.length} meetings total · {entries.filter(e => e.meeting_date >= today).length} upcoming
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShowUpcomingOnly(v => !v)}>
            {showUpcomingOnly ? "Show all" : "Upcoming only"}
          </Button>
          {entries.length === 0 && !loading && (
            <Button variant="outline" onClick={seedData} disabled={seeding}>
              {seeding ? "Loading..." : "Load 2026 data"}
            </Button>
          )}
          <Button onClick={openAdd}>
            <Plus className="mr-1 h-4 w-4" /> Add meeting
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-6">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </div>
          ) : displayed.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {entries.length === 0
                ? 'No meetings yet. Click "Load 2026 data" to import the full calendar.'
                : "No upcoming meetings."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 dark:bg-slate-800 text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="px-3 py-3 text-left w-8">#</th>
                  <th className="px-3 py-3 text-left">Date</th>
                  <th className="px-3 py-3 text-left">Day</th>
                  <th className="px-3 py-3 text-left">Special races</th>
                  <th className="px-3 py-3 text-left">Dist</th>
                  <th className="px-3 py-3 text-left">Work</th>
                  <th className="px-3 py-3 text-left">Notes</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                  {displayed.map((entry, idx) => {
                    const isPast = entry.meeting_date < today;
                    const specials = CLASS_KEYS
                      .map((key, i) => isSpecial(entry[key]) ? { label: CLASS_LABELS[i], value: entry[key] } : null)
                      .filter(Boolean) as { label: string; value: string }[];
                    return (
                      <tr
                        key={entry.id}
                        className={[
                          "border-b transition-colors",
                          isPast ? "opacity-50" : "",
                          idx % 2 === 0 ? "" : "bg-slate-50/50 dark:bg-slate-800/30",
                        ].join(" ")}
                      >
                        <td className="px-3 py-2 font-medium text-muted-foreground">{entry.meeting_number}</td>
                        <td className="px-3 py-2 whitespace-nowrap font-medium">{formatDate(entry.meeting_date)}</td>
                        <td className="px-3 py-2 text-muted-foreground">{dayOfWeek(entry.meeting_date)}</td>
                        <td className="px-3 py-2">
                          {specials.length === 0 ? (
                            <span className="text-muted-foreground text-xs">All normal</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {specials.map(s => (
                                <span key={s!.label} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${stageBadgeClass(s!.value)}`}>
                                  <span className="opacity-60">{s!.label}:</span> {s!.value}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{entry.dist_for_normal ?? "—"}</td>
                        <td className="px-3 py-2">{workBadge(entry.work_status)}</td>
                        <td className="px-3 py-2 text-muted-foreground">{entry.notes || ""}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEdit(entry)}
                              className="rounded p-1.5 text-muted-foreground hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-foreground"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            {deleteId === entry.id ? (
                              <>
                                <button onClick={() => confirmDelete(entry.id)} className="rounded px-2 py-1 text-xs bg-red-100 text-red-700 hover:bg-red-200">Confirm</button>
                                <button onClick={() => setDeleteId(null)} className="rounded px-2 py-1 text-xs bg-slate-100 text-slate-600 hover:bg-slate-200">Cancel</button>
                              </>
                            ) : (
                              <button
                                onClick={() => setDeleteId(entry.id)}
                                className="rounded p-1.5 text-muted-foreground hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
          )}
        </CardContent>
      </Card>

      {/* Edit / Add Modal */}
      {(editEntry || addingNew) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 shadow-xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="font-semibold">{addingNew ? "Add meeting" : `Edit Meeting ${editEntry?.meeting_number}`}</h2>
              <button onClick={closeModal} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Meeting #</label>
                  <input
                    type="number"
                    value={form.meeting_number}
                    onChange={e => setForm(f => ({ ...f, meeting_number: Number(e.target.value) }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:bg-slate-800 dark:border-slate-700"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Date</label>
                  <input
                    type="date"
                    value={form.meeting_date}
                    onChange={e => setForm(f => ({ ...f, meeting_date: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:bg-slate-800 dark:border-slate-700"
                  />
                </div>
              </div>

              {CLASS_KEYS.map((key, i) => (
                <div key={key} className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">{CLASS_LABELS[i]}</label>
                  <input
                    type="text"
                    value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:bg-slate-800 dark:border-slate-700"
                  />
                </div>
              ))}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Distance (normal)</label>
                  <input
                    type="number"
                    value={form.dist_for_normal ?? ""}
                    onChange={e => setForm(f => ({ ...f, dist_for_normal: e.target.value ? Number(e.target.value) : null }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:bg-slate-800 dark:border-slate-700"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Work status</label>
                  <select
                    value={form.work_status ?? ""}
                    onChange={e => setForm(f => ({ ...f, work_status: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:bg-slate-800 dark:border-slate-700"
                  >
                    <option value="">—</option>
                    <option value="WORK">WORK</option>
                    <option value="NO WORK">NO WORK</option>
                    <option value="TBA">TBA</option>
                    <option value="SR">SR</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Notes</label>
                <input
                  type="text"
                  value={form.notes ?? ""}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-4">
              <Button variant="outline" onClick={closeModal}>Cancel</Button>
              <Button onClick={saveEntry} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
