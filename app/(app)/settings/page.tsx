"use client";

import { useState } from "react";
import {
  CreditCard,
  FlaskConical,
  KeyRound,
  LogOut,
  Radio,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { SwipeShell } from "@/components/swipe/SwipeShell";
import { IntegrationStatusCard } from "@/components/settings/IntegrationStatusCard";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { DevClearSeenButton } from "@/components/swipe/DevClearSeenButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { USE_REAL_JOBS } from "@/lib/config";

const MODEL_PROVIDERS = [
  { value: "claude", label: "Claude (Anthropic)" },
  { value: "openai", label: "OpenAI" },
  { value: "gemini", label: "Gemini (Google)" },
  { value: "openrouter", label: "OpenRouter" },
];

export default function Demo2SettingsPage() {
  const [provider, setProvider] = useState("claude");

  return (
    <SwipeShell
      title="Settings & Integrations"
      description="Where the backend, scraper, and Career-Ops will connect"
    >
      <div className="space-y-4">
        <IntegrationStatusCard
          icon={LogOut}
          title="Account"
          description="You're signed in. Sign out to return to the landing page."
          statusLabel="Signed in"
          tone="live"
        >
          <SignOutButton />
        </IntegrationStatusCard>

        <IntegrationStatusCard
          icon={FlaskConical}
          title="Developer tools"
          description="Testing only — clears your 'seen jobs' history so previously-swiped jobs can reappear in the feed. Does not affect Reset."
          statusLabel="Dev"
          tone="disabled"
        >
          <DevClearSeenButton />
        </IntegrationStatusCard>

        <IntegrationStatusCard
          icon={ShieldCheck}
          title="Human-confirmed apply mode"
          description="Applications are never submitted automatically. You review every job and confirm before anything is marked as applied."
          statusLabel="Enabled"
          tone="live"
        />

        <IntegrationStatusCard
          icon={Sparkles}
          title="Career-Ops integration"
          description="Fit scoring runs on simulated data through the frontend adapter layer. Live evaluation plugs in behind the same interface."
          statusLabel="Mock Mode"
          tone="mock"
        />

        <IntegrationStatusCard
          icon={Radio}
          title="Scraper feed"
          description={
            USE_REAL_JOBS
              ? "Live jobs are pulled read-only from the scraper's SQL Server database (ITJC.tbl_JobMaster + job descriptions)."
              : "Showing built-in sample jobs. Set NEXT_PUBLIC_USE_REAL_JOBS=true to load the live scraper feed."
          }
          statusLabel={USE_REAL_JOBS ? "Connected · SQL Server" : "Sample data"}
          tone={USE_REAL_JOBS ? "live" : "mock"}
        />

        <IntegrationStatusCard
          icon={KeyRound}
          title="Model provider"
          description="Choose which model powers evaluation once the backend is wired up. No real API calls are made in this demo."
          statusLabel="Demo only"
          tone="disabled"
        >
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="provider">Provider</Label>
              <Select
                id="provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                {MODEL_PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="apikey">API key</Label>
              <Input
                id="apikey"
                type="password"
                placeholder="sk-… (disabled in demo)"
                disabled
              />
            </div>
          </div>
        </IntegrationStatusCard>

        <IntegrationStatusCard
          icon={CreditCard}
          title="Plan & credits"
          description="Free-tier limits, credits, and payment will be decided later. Nothing is billed in this demo."
          statusLabel="Free demo"
          tone="disabled"
        >
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface p-4">
            <div>
              <p className="text-sm font-medium">Demo plan</p>
              <p className="text-xs text-muted-foreground">
                Unlimited swiping of mock jobs
              </p>
            </div>
            <Badge variant="primary">∞ credits</Badge>
          </div>
        </IntegrationStatusCard>

        <p className="px-1 pt-1 text-center text-xs text-muted-foreground">
          Backend, rate limits, API keys, and payment model will be decided
          later. This MVP demonstrates the frontend flow and integration seams.
        </p>
      </div>
    </SwipeShell>
  );
}
