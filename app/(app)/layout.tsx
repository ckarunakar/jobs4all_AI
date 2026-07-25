import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SwipeStoreProvider } from "@/lib/swipe/swipeStore";
import { ToastProvider } from "@/components/ui/toast";
import { ScoresProvider } from "@/lib/scoring/scoresClient";
import { SwipeInteractionsProvider } from "@/components/swipe/SwipeInteractionsProvider";

/**
 * App shell — protects the whole (app) route group. Unauthenticated users are
 * redirected to /login. Wraps store + toasts + AI scores + shared modals.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <SwipeStoreProvider sessionEmail={session.user.email ?? undefined}>
      <ToastProvider>
        <ScoresProvider>
          <SwipeInteractionsProvider>{children}</SwipeInteractionsProvider>
        </ScoresProvider>
      </ToastProvider>
    </SwipeStoreProvider>
  );
}
