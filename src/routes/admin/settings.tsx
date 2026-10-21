import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/errors";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { AiProviderId, PaymentGatewayId } from "@/lib/platform-config.server";
import {
  getAdminSettings,
  getPricingConfig,
  updateAiProvider,
  updatePaymentGateway,
  updatePlanPricing,
  updatePlatformSettings,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettings,
});

const PROVIDER_LABELS: Record<AiProviderId, { name: string; hint: string }> = {
  google: { name: "Google AI (Gemini)", hint: "Chat, voiceover and text-to-image" },
  groq: { name: "Groq", hint: "Fast chat fallback and captions" },
  pollinations: { name: "Pollinations", hint: "Image generation fallback" },
};

const GATEWAY_LABELS: Record<
  PaymentGatewayId,
  { name: string; hint: string; modes: { value: string; label: string }[] }
> = {
  stripe: {
    name: "Stripe",
    hint: "Cards, Apple Pay and Google Pay. Recurring subscriptions.",
    modes: [
      { value: "live", label: "Live" },
      { value: "test", label: "Test" },
    ],
  },
  paypal: {
    name: "PayPal",
    hint: "PayPal balance and cards. Recurring subscriptions.",
    modes: [
      { value: "live", label: "Live" },
      { value: "sandbox", label: "Sandbox" },
    ],
  },
};

function AdminSettings() {
  const settings = useQuery({ queryKey: ["admin-settings"], queryFn: () => getAdminSettings() });

  return (
    <>
      <PageHeader
        title="Settings"
        description="Rotate AI provider keys, connect Stripe and PayPal, and control platform-wide behaviour. Changes take effect immediately, no redeploy."
      />

      {settings.isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : settings.isError || !settings.data ? (
        <Card className="glass-panel">
          <CardContent className="py-6 text-sm text-destructive">
            {settings.error instanceof Error ? settings.error.message : "Failed to load settings."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {(Object.keys(PROVIDER_LABELS) as AiProviderId[]).map((id) => (
            <ProviderCard key={id} id={id} settings={settings.data} />
          ))}
          <PaymentsCard settings={settings.data} />
          <PlanPricingCard />
          <PlatformCard settings={settings.data} />
        </div>
      )}
    </>
  );
}

type SettingsData = Awaited<ReturnType<typeof getAdminSettings>>;

function ProviderCard({ id, settings }: { id: AiProviderId; settings: SettingsData }) {
  const provider = settings.ai[id];
  const queryClient = useQueryClient();
  const [model, setModel] = useState(provider.model);
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(provider.enabled);

  const save = useMutation({
    mutationFn: () =>
      updateAiProvider({
        data: { id, enabled, model, baseUrl, apiKey: apiKey || undefined },
      }),
    onSuccess: () => {
      toast.success(`${PROVIDER_LABELS[id].name} updated`);
      setApiKey("");
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (error) => toast.error(toUserMessage(error, "Update failed")),
  });

  return (
    <Card className="glass-panel">
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-lg">{PROVIDER_LABELS[id].name}</CardTitle>
          <CardDescription>{PROVIDER_LABELS[id].hint}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={provider.keyConfigured ? "secondary" : "outline"}>
            {provider.keyConfigured ? `Key ••••${provider.keyLast4}` : "No key"}
          </Badge>
          {provider.keySource !== "none" && <Badge variant="outline">{provider.keySource}</Badge>}
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-model`}>Model</Label>
            <Input id={`${id}-model`} value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-base`}>Base URL</Label>
            <Input id={`${id}-base`} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-key`}>API key</Label>
          <Input
            id={`${id}-key`}
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              provider.keyConfigured ? "Leave blank to keep current key" : "Paste a new key"
            }
          />
        </div>
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          Save provider
        </Button>
      </CardContent>
    </Card>
  );
}

function PlatformCard({ settings }: { settings: SettingsData }) {
  const platform = settings.platform;
  const queryClient = useQueryClient();
  const [signupsOpen, setSignupsOpen] = useState(platform.signups_open);
  const [maintenance, setMaintenance] = useState(platform.maintenance_mode);
  const [freeCredits, setFreeCredits] = useState(String(platform.free_credits_monthly));
  const [announcement, setAnnouncement] = useState(platform.announcement);

  const save = useMutation({
    mutationFn: () =>
      updatePlatformSettings({
        data: {
          signups_open: signupsOpen,
          maintenance_mode: maintenance,
          free_credits_monthly: Number(freeCredits) || 0,
          announcement,
        },
      }),
    onSuccess: () => {
      toast.success("Platform settings saved");
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (error) => toast.error(toUserMessage(error, "Save failed")),
  });

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle className="text-lg">Platform</CardTitle>
        <CardDescription>Global switches that affect every visitor and workspace.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
          <div>
            <p className="text-sm font-medium">Open signups</p>
            <p className="text-xs text-muted-foreground">Allow new accounts to register.</p>
          </div>
          <Switch checked={signupsOpen} onCheckedChange={setSignupsOpen} />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
          <div>
            <p className="text-sm font-medium">Maintenance mode</p>
            <p className="text-xs text-muted-foreground">Show a maintenance notice to users.</p>
          </div>
          <Switch checked={maintenance} onCheckedChange={setMaintenance} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="free-credits">Free monthly credits</Label>
          <Input
            id="free-credits"
            type="number"
            value={freeCredits}
            onChange={(e) => setFreeCredits(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="announcement">Announcement</Label>
          <Textarea
            id="announcement"
            rows={3}
            value={announcement}
            onChange={(e) => setAnnouncement(e.target.value)}
            placeholder="Shown to signed-in users when set."
          />
        </div>
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          Save platform settings
        </Button>
      </CardContent>
    </Card>
  );
}

function PaymentsCard({ settings }: { settings: SettingsData }) {
  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle className="text-lg">Payments</CardTitle>
        <CardDescription>
          Connect Stripe and PayPal. A workspace is billed its selected plan through whichever
          gateway is enabled. Keys pasted here override environment variables.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(Object.keys(GATEWAY_LABELS) as PaymentGatewayId[]).map((id) => (
          <GatewayCard key={id} id={id} settings={settings} />
        ))}
      </CardContent>
    </Card>
  );
}

const PRICING_PLAN_ORDER = ["creator", "pro", "agency"] as const;
const PRICING_CYCLE_ORDER = ["monthly", "yearly"] as const;

type PricingPlanKey = (typeof PRICING_PLAN_ORDER)[number];
type PricingCycle = (typeof PRICING_CYCLE_ORDER)[number];
type PricingConfigData = Awaited<ReturnType<typeof getPricingConfig>>;

function PlanPricingCard() {
  const queryClient = useQueryClient();
  const pricing = useQuery({ queryKey: ["admin-pricing"], queryFn: () => getPricingConfig() });

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle className="text-lg">Plan pricing</CardTitle>
        <CardDescription>
          The amount charged for each plan and cycle, plus the Stripe price id used for checkout.
          This is the source of truth for what customers pay and for the price shown in the app.
          PayPal plans are provisioned automatically from the amount.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {pricing.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : pricing.isError || !pricing.data ? (
          <p className="text-sm text-destructive">
            {pricing.error instanceof Error ? pricing.error.message : "Failed to load pricing."}
          </p>
        ) : (
          PRICING_PLAN_ORDER.map((planKey) => (
            <PricingPlanRow
              key={planKey}
              planKey={planKey}
              pricing={pricing.data}
              onSaved={() => queryClient.invalidateQueries({ queryKey: ["admin-pricing"] })}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function PricingPlanRow({
  planKey,
  pricing,
  onSaved,
}: {
  planKey: PricingPlanKey;
  pricing: PricingConfigData;
  onSaved: () => void;
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="mb-3 text-sm font-medium capitalize">{planKey}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {PRICING_CYCLE_ORDER.map((cycle) => (
          <PricingCycleEditor
            key={cycle}
            planKey={planKey}
            cycle={cycle}
            entry={pricing[planKey][cycle]}
            onSaved={onSaved}
          />
        ))}
      </div>
    </div>
  );
}

function PricingCycleEditor({
  planKey,
  cycle,
  entry,
  onSaved,
}: {
  planKey: PricingPlanKey;
  cycle: PricingCycle;
  entry: { amountCents: number; stripePriceId: string; paypalPlanId: string };
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState((entry.amountCents / 100).toFixed(2));
  const [stripePriceId, setStripePriceId] = useState(entry.stripePriceId);

  const save = useMutation({
    mutationFn: () => {
      const amountCents = Math.round(Number(amount) * 100);
      if (!Number.isFinite(amountCents) || amountCents < 0) {
        throw new Error("Enter a valid amount in dollars.");
      }
      return updatePlanPricing({
        data: { planKey, cycle, amountCents, stripePriceId: stripePriceId.trim() },
      });
    },
    onSuccess: () => {
      toast.success(`${planKey} ${cycle} price updated`);
      onSaved();
    },
    onError: (error) => toast.error(toUserMessage(error, "Update failed")),
  });

  const idPrefix = `price-${planKey}-${cycle}`;

  return (
    <div className="space-y-3 rounded-md border border-border/70 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{cycle}</p>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-amount`}>Amount (USD)</Label>
        <Input
          id={`${idPrefix}-amount`}
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-stripe`}>Stripe price id</Label>
        <Input
          id={`${idPrefix}-stripe`}
          value={stripePriceId}
          onChange={(e) => setStripePriceId(e.target.value)}
          placeholder="price_..."
        />
        {!stripePriceId.trim() && (
          <p className="text-xs text-muted-foreground">
            Stripe checkout is disabled for this plan until a price id is set.
          </p>
        )}
        {entry.paypalPlanId && (
          <p className="text-xs text-muted-foreground">PayPal plan: {entry.paypalPlanId}</p>
        )}
      </div>
      <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
        Save
      </Button>
    </div>
  );
}

function GatewayCard({ id, settings }: { id: PaymentGatewayId; settings: SettingsData }) {
  const gateway = settings.payments[id];
  const queryClient = useQueryClient();
  const meta = GATEWAY_LABELS[id];

  const [enabled, setEnabled] = useState(gateway.enabled);
  const [mode, setMode] = useState(
    meta.modes.some((m) => m.value === gateway.mode)
      ? gateway.mode
      : (meta.modes[0]?.value ?? gateway.mode),
  );
  const [secretKey, setSecretKey] = useState("");
  const [publishableKey, setPublishableKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [webhookId, setWebhookId] = useState("");

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const webhookUrl = `${origin}/api/payments/${id}`;

  const save = useMutation({
    mutationFn: () =>
      updatePaymentGateway({
        data:
          id === "stripe"
            ? {
                id,
                enabled,
                mode,
                secretKey: secretKey || undefined,
                publishableKey: publishableKey || undefined,
                webhookSecret: webhookSecret || undefined,
              }
            : {
                id,
                enabled,
                mode,
                clientId: clientId || undefined,
                clientSecret: clientSecret || undefined,
                webhookId: webhookId || undefined,
              },
      }),
    onSuccess: () => {
      toast.success(`${meta.name} updated`);
      setSecretKey("");
      setPublishableKey("");
      setWebhookSecret("");
      setClientId("");
      setClientSecret("");
      setWebhookId("");
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (error) => toast.error(toUserMessage(error, "Update failed")),
  });

  const idPrefix = `gateway-${id}`;

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium">{meta.name}</p>
          <p className="text-xs text-muted-foreground">{meta.hint}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={gateway.configured ? "secondary" : "outline"}>
            {gateway.configured ? "Configured" : "Not configured"}
          </Badge>
          {gateway.keySource !== "none" && <Badge variant="outline">{gateway.keySource}</Badge>}
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-mode`}>Mode</Label>
          <Select value={mode} onValueChange={setMode}>
            <SelectTrigger id={`${idPrefix}-mode`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {meta.modes.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {id === "stripe" ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-publishable`}>Publishable key</Label>
              <Input
                id={`${idPrefix}-publishable`}
                value={publishableKey}
                onChange={(e) => setPublishableKey(e.target.value)}
                placeholder={gateway.publicId ?? "pk_live_…"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-secret`}>Secret key</Label>
              <Input
                id={`${idPrefix}-secret`}
                type="password"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder={
                  gateway.secretConfigured ? "Leave blank to keep current key" : "sk_live_…"
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-webhook-secret`}>Webhook signing secret</Label>
              <Input
                id={`${idPrefix}-webhook-secret`}
                type="password"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder={gateway.webhookConfigured ? "Leave blank to keep current" : "whsec_…"}
              />
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-client-id`}>Client ID</Label>
              <Input
                id={`${idPrefix}-client-id`}
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder={gateway.publicId ?? "AX…"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-client-secret`}>Client secret</Label>
              <Input
                id={`${idPrefix}-client-secret`}
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={gateway.secretConfigured ? "Leave blank to keep current secret" : "E…"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-webhook-id`}>Webhook ID</Label>
              <Input
                id={`${idPrefix}-webhook-id`}
                value={webhookId}
                onChange={(e) => setWebhookId(e.target.value)}
                placeholder={
                  gateway.webhookConfigured ? "Leave blank to keep current" : "Webhook ID"
                }
              />
            </div>
          </>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Webhook endpoint: <span className="font-mono">{webhookUrl}</span>
      </p>

      <Button className="mt-4" disabled={save.isPending} onClick={() => save.mutate()}>
        Save {meta.name}
      </Button>
    </div>
  );
}
