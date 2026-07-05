"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock3,
  Download,
  Link2,
  Mail,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createWebhook,
  deleteWebhook,
  exportIcs,
  fetchIntegrations,
  fetchWebhooks,
  importIcs,
  type IcsImportResult,
  type IntegrationStatus,
  type WebhookSubscription,
} from "@/lib/api";

const PROVIDER_NAMES: Record<string, string> = {
  google: "Google Calendar",
  zoom: "Zoom",
  slack: "Slack",
  microsoft: "Microsoft 365",
  notion: "Notion",
};

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected integration error";
}

export default function IntegrationsPage() {
  const router = useRouter();
  const [statuses, setStatuses] = useState<IntegrationStatus[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<IcsImportResult | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookDescription, setWebhookDescription] = useState("");
  const [signingSecret, setSigningSecret] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [integrationData, webhookData] = await Promise.all([
        fetchIntegrations(),
        fetchWebhooks(),
      ]);
      setStatuses(integrationData);
      setWebhooks(webhookData);
    } catch (loadError) {
      setError(messageFrom(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    Promise.all([fetchIntegrations(), fetchWebhooks()])
      .then(([integrationData, webhookData]) => {
        if (cancelled) return;
        setStatuses(integrationData);
        setWebhooks(webhookData);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(messageFrom(loadError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const byProvider = useMemo(
    () => new Map(statuses.map((item) => [item.provider, item])),
    [statuses],
  );

  const downloadCalendar = async () => {
    setWorking(true);
    setError("");
    try {
      const blob = await exportIcs();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "timeora.ics";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(messageFrom(downloadError));
    } finally {
      setWorking(false);
    }
  };

  const uploadCalendar = async () => {
    if (!file) return;
    setWorking(true);
    setError("");
    setImportResult(null);
    try {
      const result = await importIcs(file);
      setImportResult(result);
      setFile(null);
    } catch (uploadError) {
      setError(messageFrom(uploadError));
    } finally {
      setWorking(false);
    }
  };

  const addWebhook = async () => {
    if (!webhookUrl.trim()) return;
    setWorking(true);
    setError("");
    setSigningSecret("");
    try {
      const created = await createWebhook({
        url: webhookUrl.trim(),
        description: webhookDescription.trim(),
      });
      setWebhooks((current) => [created, ...current]);
      setSigningSecret(created.signing_secret);
      setWebhookUrl("");
      setWebhookDescription("");
      void load();
    } catch (createError) {
      setError(messageFrom(createError));
    } finally {
      setWorking(false);
    }
  };

  const removeWebhook = async (id: string) => {
    setWorking(true);
    setError("");
    try {
      await deleteWebhook(id);
      setWebhooks((current) => current.filter((item) => item.id !== id));
      void load();
    } catch (deleteError) {
      setError(messageFrom(deleteError));
    } finally {
      setWorking(false);
    }
  };

  const resend = byProvider.get("resend");
  const planned = statuses.filter((item) => PROVIDER_NAMES[item.provider]);

  return (
    <main className="min-h-screen bg-[#fafbfc] dark:bg-zinc-950 text-slate-900 dark:text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
        <div className="mb-8 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back to dashboard"
            onClick={() => router.push("/dashboard")}
            className="rounded-xl"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-600">
              Settings
            </p>
            <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
              Move calendar data and connect Timeora to external workflows.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-slate-200/80 shadow-sm dark:border-white/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-violet-600" />
                Calendar files
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <Label htmlFor="ics-file">Import an .ics file</Label>
                <Input
                  id="ics-file"
                  type="file"
                  accept=".ics,text/calendar"
                  className="mt-2"
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                />
                <p className="mt-2 text-xs text-slate-500 dark:text-zinc-400">
                  Maximum 1 MB. Duplicate UIDs and conflicting events are skipped.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={uploadCalendar} disabled={!file || working}>
                  <Upload className="mr-2 h-4 w-4" />
                  Import calendar
                </Button>
                <Button variant="outline" onClick={downloadCalendar} disabled={working}>
                  <Download className="mr-2 h-4 w-4" />
                  Export calendar
                </Button>
              </div>
              {importResult && (
                <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                  Imported {importResult.imported}; skipped {importResult.skipped}.
                  {importResult.errors.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                      {importResult.errors.slice(0, 5).map((item, index) => (
                        <li key={`${index}-${item}`}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 shadow-sm dark:border-white/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-violet-600" />
                Email notifications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 p-4 dark:border-white/10">
                <div>
                  <p className="font-semibold">Resend</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                    Sends create, update, and cancellation notices to participant emails.
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    resend?.connected
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                  }`}
                >
                  {resend?.connected ? "Active" : "Needs server config"}
                </span>
              </div>
              <div className="mt-4 flex items-start gap-2 text-xs text-slate-500 dark:text-zinc-400">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                API keys stay server-side and are never exposed to this page.
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6 border-slate-200/80 shadow-sm dark:border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-violet-600" />
              Outgoing webhooks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-[1fr_0.65fr_auto]">
              <div>
                <Label htmlFor="webhook-url">HTTPS endpoint</Label>
                <Input
                  id="webhook-url"
                  type="url"
                  value={webhookUrl}
                  placeholder="https://example.com/hooks/timeora"
                  className="mt-2"
                  onChange={(event) => setWebhookUrl(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="webhook-description">Description</Label>
                <Input
                  id="webhook-description"
                  value={webhookDescription}
                  placeholder="Zapier workflow"
                  className="mt-2"
                  onChange={(event) => setWebhookDescription(event.target.value)}
                />
              </div>
              <Button
                onClick={addWebhook}
                disabled={!webhookUrl.trim() || working}
                className="self-end"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
            </div>

            {signingSecret && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                <p className="font-semibold">Copy this signing secret now.</p>
                <code className="mt-2 block break-all rounded-lg bg-white/80 p-2 text-xs dark:bg-black/20">
                  {signingSecret}
                </code>
                <p className="mt-2 text-xs">It will not be shown again.</p>
              </div>
            )}

            <div className="space-y-3">
              {webhooks.length === 0 && !loading && (
                <p className="rounded-xl border border-dashed border-slate-300 dark:border-zinc-600 p-5 text-center text-sm text-slate-500 dark:text-zinc-400">
                  No webhook subscriptions yet.
                </p>
              )}
              {webhooks.map((webhook) => (
                <div
                  key={webhook.id}
                  className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 p-4 dark:border-white/10"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{webhook.url}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                      {webhook.description || "No description"} ·{" "}
                      {webhook.event_types.join(", ")}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete webhook"
                    disabled={working}
                    onClick={() => void removeWebhook(webhook.id)}
                    className="shrink-0 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/30 dark:hover:text-rose-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <section className="mt-8">
          <div className="mb-4">
            <h2 className="text-lg font-bold">Provider adapters</h2>
            <p className="text-sm text-slate-500 dark:text-zinc-400">
              Secure token storage is ready; provider OAuth and sync workers are the next deployment step.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {planned.map((provider) => (
              <div
                key={provider.provider}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900"
              >
                <div>
                  <p className="font-semibold">{PROVIDER_NAMES[provider.provider]}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                    {provider.connected ? "Connected" : "Foundation ready"}
                  </p>
                </div>
                {provider.connected ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : (
                  <Clock3 className="h-5 w-5 text-slate-400" />
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
