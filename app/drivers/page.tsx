"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { normalizeName } from "@/lib/normalizeName";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [newName, setNewName] = useState("");
  const [newIdCard, setNewIdCard] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const [selectedFileName, setSelectedFileName] = useState("");
  const [importing, setImporting] = useState(false);

  async function loadDrivers() {
    setLoading(true);

    const { data, error } = await supabase
      .from("drivers")
      .select("id,full_name,id_card,phone,created_at")
      .order("full_name", { ascending: true });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    setDrivers((data as Driver[]) || []);
    setLoading(false);
  }

  async function addDriver() {
    if (!newName.trim()) {
      alert("Please enter the driver's full name.");
      return;
    }

    setSaving(true);

    const cleanName = newName.trim();

    const { error } = await supabase.from("drivers").insert({
      full_name: cleanName,
      normalized_name: normalizeName(cleanName),
      id_card: newIdCard.trim() || null,
      phone: newPhone.trim() || null,
    });

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
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
      alert(error.message);
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

      alert(`Imported ${imported} drivers.`);
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

    async function checkAuth() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (session?.user) {
        setCheckingAuth(false);
        await loadDrivers();
        return;
      }

      setTimeout(async () => {
        const {
          data: { session: retrySession },
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (retrySession?.user) {
          setCheckingAuth(false);
          await loadDrivers();
        } else {
          router.replace("/login?redirectTo=/drivers");
        }
      }, 500);
    }

    checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;

      if (session?.user) {
        setCheckingAuth(false);
        await loadDrivers();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-muted/30 p-6">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm text-muted-foreground">Checking login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">DriverInfo</h1>
            <p className="text-sm text-muted-foreground">
              Manage drivers, contact details, and imports.
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/")}>
              Home
            </Button>
            <Button variant="outline" onClick={() => router.push("/meetings")}>
              Meetings
            </Button>
          </div>
        </div>

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
                {selectedFileName ? `Selected file: ${selectedFileName}` : "No file selected"}
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
              <p className="text-sm text-muted-foreground">Loading drivers...</p>
            )}

            {!loading && filteredDrivers.length === 0 && (
              <p className="text-sm text-muted-foreground">No drivers found.</p>
            )}

            {!loading && filteredDrivers.length > 0 && (
              <div className="space-y-3">
                {filteredDrivers.map((driver) => (
                  <div
                    key={driver.id}
                    className="grid gap-3 rounded-xl border bg-background p-4 md:grid-cols-3"
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
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}