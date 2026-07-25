import { UserRound } from "lucide-react";
import { auth } from "@/auth";
import { SwipeShell } from "@/components/swipe/SwipeShell";
import { IntegrationStatusCard } from "@/components/settings/IntegrationStatusCard";
import { SignOutButton } from "@/components/auth/SignOutButton";

export default async function SettingsPage() {
  const session = await auth();
  const name = session?.user?.name?.trim();
  const email = session?.user?.email?.trim();
  const who =
    name && email ? `${name} (${email})` : (email ?? name ?? "your account");

  return (
    <SwipeShell title="Settings" description="Manage your account">
      <div className="space-y-4">
        <IntegrationStatusCard
          icon={UserRound}
          title="Account"
          description={`Signed in as ${who}. Signing out returns you to the landing page.`}
          statusLabel="Signed in"
          tone="live"
        >
          <SignOutButton />
        </IntegrationStatusCard>
      </div>
    </SwipeShell>
  );
}
