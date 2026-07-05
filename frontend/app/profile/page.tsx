"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Save, User, Clock, Shield, Trash2, Download, Calendar as CalendarIcon } from "lucide-react";

interface UserPreferences {
  timezone: string;
  defaultDuration: number;
  workingHoursStart: string;
  workingHoursEnd: string;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  timezone: "",
  defaultDuration: 60,
  workingHoursStart: "09:00",
  workingHoursEnd: "17:00",
};

function getTokenEmail(): string | null {
  try {
    const token = localStorage.getItem("token");
    if (!token) return null;

    // Simple JWT payload decode (no validation)
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.email || payload.user_metadata?.email || null;
  } catch {
    return null;
  }
}

export default function ProfilePage() {
  const router = useRouter();
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Load preferences + user info
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/login");
      return;
    }

    const email = getTokenEmail();
    // Profile data is sourced from browser-only token storage after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUserEmail(email);

    // Load from localStorage
    const saved = localStorage.getItem("timeora_preferences");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setPreferences({ ...DEFAULT_PREFERENCES, ...parsed });
      } catch {
        // ignore
      }
    } else {
      // Use detected timezone if none saved
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setPreferences((prev) => ({ ...prev, timezone: detected }));
    }
  }, [router]);

  const handleChange = (key: keyof UserPreferences, value: string | number) => {
    setPreferences((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    setIsSaving(true);
    setMessage(null);

    try {
      localStorage.setItem("timeora_preferences", JSON.stringify(preferences));

      // Optional: sync to backend later
      setMessage("Preferences saved successfully!");
      setTimeout(() => setMessage(null), 2500);
    } catch {
      setMessage("Failed to save preferences.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportData = async () => {
    try {
      const token = localStorage.getItem("token");
      const baseUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api").replace(/\/$/, "");
      const res = await fetch(`${baseUrl}/export/ics`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "timeora-full-export.ics";
      a.click();
      URL.revokeObjectURL(url);
      setMessage("Data exported successfully!");
    } catch {
      setMessage("Export failed. Please try again.");
    }
  };

  const handleDeleteAccount = () => {
    if (!confirm("Are you sure you want to delete your account? This action cannot be undone.")) {
      return;
    }
    // Placeholder - in real app would call backend
    localStorage.removeItem("token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("timeora_preferences");
    alert("Account deletion simulated. You have been logged out.");
    router.push("/");
  };

  const handleBack = () => {
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen bg-[#fafbfc] dark:bg-zinc-950 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200/60 dark:border-white/5 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-2xl px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleBack} className="rounded-xl">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          <div className="flex items-center gap-2">
            <img
              src="/logomark_lightmode.png"
              alt="Timeora Logo"
              className="block dark:hidden w-8 h-8 object-contain"
            />
            <img
              src="/logomark.png"
              alt="Timeora Logo"
              className="hidden dark:block w-8 h-8 object-contain"
            />
            <div>
              <div className="font-bold tracking-tight">Profile</div>
              <div className="text-[10px] text-slate-400 dark:text-zinc-500 -mt-0.5">Timeora</div>
            </div>
          </div>
        </div>

        <Button onClick={handleSave} disabled={isSaving} className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white">
          <Save className="w-4 h-4 mr-2" />
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-8 space-y-8">
        {message && (
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
            {message}
          </div>
        )}

        {/* Account Section */}
        <section className="rounded-3xl border border-slate-200/60 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 p-6 backdrop-blur">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 rounded-xl bg-violet-100 dark:bg-violet-900/30">
              <User className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Account</h2>
              <p className="text-sm text-slate-500 dark:text-zinc-400">Your basic account information</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label className="text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-400">Email</Label>
              <div className="mt-1.5 px-4 py-3 rounded-xl border bg-slate-50 dark:bg-zinc-800/50 text-sm font-medium">
                {userEmail || "user@example.com"}
              </div>
            </div>

            <div>
              <Label htmlFor="password" className="text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                Change Password
              </Label>
              <div className="flex gap-3 mt-1.5">
                <Input id="password" type="password" placeholder="New password" className="flex-1" />
                <Button variant="outline" className="rounded-xl">Update</Button>
              </div>
              <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1">Password change will be sent to your email (demo).</p>
            </div>
          </div>
        </section>

        {/* Preferences Section */}
        <section className="rounded-3xl border border-slate-200/60 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 p-6 backdrop-blur">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-900/30">
              <Clock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Preferences</h2>
              <p className="text-sm text-slate-500 dark:text-zinc-400">Customize how Timeora works for you</p>
            </div>
          </div>

          <div className="grid gap-6">
            {/* Timezone */}
            <div>
              <Label className="text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-400">Timezone</Label>
              <Input
                value={preferences.timezone}
                onChange={(e) => handleChange("timezone", e.target.value)}
                className="mt-1.5"
                placeholder="e.g. Asia/Jakarta"
              />
              <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1">Leave empty to use your browser&apos;s timezone.</p>
            </div>

            {/* Default Duration */}
            <div>
              <Label className="text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-400">Default Event Duration (minutes)</Label>
              <Input
                type="number"
                value={preferences.defaultDuration}
                onChange={(e) => handleChange("defaultDuration", parseInt(e.target.value) || 60)}
                className="mt-1.5 w-32"
                min={5}
                max={480}
              />
            </div>

            {/* Working Hours */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-400">Working Hours Start</Label>
                <Input
                  type="time"
                  value={preferences.workingHoursStart}
                  onChange={(e) => handleChange("workingHoursStart", e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-400">Working Hours End</Label>
                <Input
                  type="time"
                  value={preferences.workingHoursEnd}
                  onChange={(e) => handleChange("workingHoursEnd", e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 -mt-3">These are used for availability analysis and recommendations.</p>
          </div>
        </section>

        {/* Data & Privacy */}
        <section className="rounded-3xl border border-slate-200/60 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 p-6 backdrop-blur">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-900/30">
              <Shield className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Data & Privacy</h2>
              <p className="text-sm text-slate-500 dark:text-zinc-400">Manage your data</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border p-4">
              <div>
                <div className="font-medium">Export All Data</div>
                <div className="text-sm text-slate-500 dark:text-zinc-400">Download your events as .ics file</div>
              </div>
              <Button variant="outline" onClick={handleExportData} className="rounded-xl">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-rose-200 dark:border-rose-900 p-4">
              <div>
                <div className="font-medium text-rose-600 dark:text-rose-400">Delete Account</div>
                <div className="text-sm text-slate-500 dark:text-zinc-400">Permanently delete your account and all data</div>
              </div>
              <Button variant="destructive" onClick={handleDeleteAccount} className="rounded-xl">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>
        </section>

        <div className="text-center text-xs text-slate-400 dark:text-zinc-500 pt-4">
          Preferences are saved locally in your browser. Some features will be synced to your account in future updates.
        </div>
      </main>
    </div>
  );
}
