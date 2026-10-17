import { UserRound } from "lucide-react";
import { auth } from "@/auth";
import { getUserById } from "@/lib/auth/users";
import { SwipeShell } from "@/components/swipe/SwipeShell";
import { IntegrationStatusCard } from "@/components/settings/IntegrationStatusCard";
import { DeleteAccountCard } from "@/components/settings/DeleteAccountCard";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { LegalLinks } from "@/components/legal/LegalLinks";

export default async function SettingsPage() {
  const session = await auth();
  const name = session?.user?.name?.trim();
  const email = session?.user?.email?.trim();
  const who =
    name && email ? `${name} (${email})` : (email ?? name ?? "your account");

  // Which confirmation the delete dialog asks for (password vs. typed email).
  // A DB hiccup hides the card rather than breaking the page.
  const userId = session?.user?.id ? Number(session.user.id) : NaN;
  const user = Number.isInteger(userId)
    ? await getUserById(userId).catch(() => null)
    : null;

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
        {user && (
          <DeleteAccountCard
            email={user.email}
            hasPassword={Boolean(user.emailPasswordEnabled && user.passwordHash)}
          />
        )}
        <LegalLinks className="pt-2" />
      </div>
    </SwipeShell>
  );
}
