"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import { normalizeName } from "@/lib/normalizeName";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Trash2, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/pageHeader";
import { Skeleton } from "@/components/ui/skeleton";

type Driver = {
  id: string;
  full_name: string;
  id_card: string | null;
  phone: string | null;
  created_at?: string | null;
};

export default function DriversPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkingAccess, setCheckingAccess] = useState(true);

  const [newName, setNewName] = useState("");
  const [newIdCard, setNewIdCard] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const [selectedFileName, setSelectedFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function loadDrivers() {
    setLoading(true);

    const { data, error } = await supabase
      .from("drivers")
      .select("id,full_name,id_card,phone,created_at")
      .order("full_name", { ascending: true });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    setDrivers((data as Driver[]) || []);
    setLoading(false);
  }

  async function addDriver() {
    if (!newName.trim()) {
      toast.error("Please enter the driver's full name.");
      return;
    }

    setSaving(true);

    const cleanName = newName.trim();

    const { data: inserted, error } = await supabase
      .from("drivers")
      .insert({
        full_name: cleanName,
        normalized_name: normalizeName(cleanName),
        id_card: newIdCard.trim() || null,
        phone: newPhone.trim() || null,
      })
      .select("id")
      .single();

    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    // Auto-link any entries that used this driver's name as a raw name
    if (inserted?.id) {
      const normalized = normalizeName(cleanName);
      const { data: rawEntries } = await supabase
        .from("entries")
        .select("id,driver_name_raw")
        .is("driver_id", null)
        .not("driver_name_raw", "is", null);

      const matches = (rawEntries || []).filter(
        (e) => normalizeName(e.driver_name_raw || "") === normalized
      );

      if (matches.length > 0) {
        await supabase
          .from("entries")
          .update({ driver_id: inserted.id, driver_name_raw: null })
          .in("id", matches.map((e) => e.id));

        toast.success(`Driver added and auto-linked to ${matches.length} existing entr${matches.length === 1 ? "y" : "ies"}.`);
      } else {
        toast.success("Driver added.");
      }
    }

    setNewName("");
    setNewIdCard("");
    setNewPhone("");
    await loadDrivers();
  }

  async function updateDriver(
    id: string,
    field: "full_name" | "id_card" | "phone",
    value: string
  ) {
    const trimmed = value.trim();

    const payload =
      field === "full_name"
        ? {
            full_name: trimmed,
            normalized_name: normalizeName(trimmed),
          }
        : { [field]: trimmed || null };

    const { error } = await supabase.from("drivers").update(payload).eq("id", id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Saved");
    }
  }

  async function deleteDriver(id: string) {
    setConfirmDeleteId(null);
    const { error } = await supabase.from("drivers").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      setDrivers((prev) => prev.filter((d) => d.id !== id));
      toast.success("Driver deleted");
    }
  }

  async function importCsvFile(file: File) {
    setImporting(true);
    setSelectedFileName(file.name);

    try {
      const text = await file.text();

      const rows = text
        .split(/\r?\n/)
        .map((r) => r.trim())
        .filter(Boolean);

      let imported = 0;

      for (const row of rows) {
        const [name, idCard, phone] = row.split(",");

        if (!name?.trim()) continue;

        const cleanName = name.trim();

        const { error } = await supabase.from("drivers").insert({
          full_name: cleanName,
          normalized_name: normalizeName(cleanName),
          id_card: idCard?.trim() || null,
          phone: phone?.trim() || null,
        });

        if (!error) imported++;
      }

      toast.success(`Imported ${imported} drivers.`);
      await loadDrivers();
    } finally {
      setImporting(false);
    }
  }

  const filteredDrivers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return drivers;

    return drivers.filter((d) => {
      return (
        d.full_name.toLowerCase().includes(q) ||
        (d.id_card || "").toLowerCase().includes(q) ||
        (d.phone || "").toLowerCase().includes(q)
      );
    });
  }, [drivers, search]);

  useEffect(() => {
    let mounted = true;

    async function checkAccess() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (!session) {
          router.replace("/");
          return;
        }

        const admin = await isCurrentUserAdmin();

        if (!mounted) return;

        if (!admin) {
          router.replace("/dashboard");
          return;
        }

        setCheckingAccess(false);
        await loadDrivers();
      } catch (error) {
        console.error("Failed to check admin access:", error);
        router.replace("/dashboard");
      }
    }

    checkAccess();

    return () => {
      mounted = false;
    };
  }, [router]);

  if (checkingAccess) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900 p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-7 w-36" />
              <Skeleton className="h-4 w-64" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-20" />
            </div>
          </div>
          <Skeleton className="h-48 w-full rounded-xl" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          title="DriverInfo"
          subtitle="Manage drivers, contact details, and imports."
          actions={
            <>
              <Button variant="outline" onClick={() => router.push("/dashboard")}>
                Dashboard
              </Button>
              <Button variant="outline" onClick={() => router.push("/admin")}>
                Admin
              </Button>
            </>
          }
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Add new driver</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Full name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <Input
                placeholder="ID card"
                value={newIdCard}
                onChange={(e) => setNewIdCard(e.target.value)}
              />
              <Input
                placeholder="Phone"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
              />
              <Button onClick={addDriver} disabled={saving} className="w-full">
                {saving ? "Saving..." : "Add driver"}
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Import drivers from CSV</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload a CSV from your existing DriverInfo sheet.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  await importCsvFile(file);
                }}
              />

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                >
                  {importing ? "Importing..." : "Choose CSV file"}
                </Button>

                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                >
                  Import CSV
                </Button>
              </div>

              <div className="rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">
                {selectedFileName
                  ? `Selected file: ${selectedFileName}`
                  : "No file selected"}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Drivers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Search by name, ID card, or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            {loading && (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            )}

            {!loading && filteredDrivers.length === 0 && (
              <p className="text-sm text-muted-foreground">No drivers found.</p>
            )}

            {!loading && filteredDrivers.length > 0 && (
              <div className="space-y-3">
                {filteredDrivers.map((driver) => (
                  <div
                    key={driver.id}
                    className="grid gap-3 rounded-xl border bg-background p-4 md:grid-cols-[1fr_1fr_1fr_auto_auto]"
                  >
                    <Input
                      defaultValue={driver.full_name}
                      onBlur={(e) =>
                        updateDriver(driver.id, "full_name", e.target.value)
                      }
                    />
                    <Input
                      defaultValue={driver.id_card || ""}
                      placeholder="ID card"
                      onBlur={(e) =>
                        updateDriver(driver.id, "id_card", e.target.value)
                      }
                    />
                    <Input
                      defaultValue={driver.phone || ""}
                      placeholder="Phone"
                      onBlur={(e) =>
                        updateDriver(driver.id, "phone", e.target.value)
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => router.push(`/admin/drivers/${driver.id}`)}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setConfirmDeleteId(driver.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete driver?"
        description="This will permanently remove the driver from the database."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => confirmDeleteId && deleteDriver(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}