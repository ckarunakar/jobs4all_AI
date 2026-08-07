import { auth } from "@/auth";
import { SwipeStoreProvider } from "@/lib/swipe/swipeStore";
import { ToastProvider } from "@/components/ui/toast";
import { SwipeInteractionsProvider } from "@/components/swipe/SwipeInteractionsProvider";

/**
 * App shell — public. Guests can browse the feed; account pages live under
 * the nested (protected) group, whose layout redirects to /login.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <SwipeStoreProvider
      sessionEmail={session?.user?.email ?? undefined}
      isLoggedIn={Boolean(session?.user)}
    >
      <ToastProvider>
        <SwipeInteractionsProvider>{children}</SwipeInteractionsProvider>
      </ToastProvider>
    </SwipeStoreProvider>
  );
}
