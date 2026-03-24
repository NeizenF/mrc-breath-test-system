"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function DebugPage() {
  const [session, setSession] = useState<any>(null);
  const [user, setUser] = useState<any>(null);

  async function refresh() {
    const s = await supabase.auth.getSession();
    const u = await supabase.auth.getUser();
    setSession(s.data.session);
    setUser(u.data.user);
  }

  useEffect(() => {
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange(() => refresh());
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen p-6 bg-slate-100 dark:bg-slate-900">
      <div className="max-w-3xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Auth Debug</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <div className="font-medium">User</div>
              <pre className="bg-muted p-3 rounded-md overflow-auto">
                {JSON.stringify(user, null, 2)}
              </pre>
            </div>
            <div>
              <div className="font-medium">Session</div>
              <pre className="bg-muted p-3 rounded-md overflow-auto">
                {JSON.stringify(session, null, 2)}
              </pre>
            </div>
            <Button variant="outline" onClick={refresh}>Refresh</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}