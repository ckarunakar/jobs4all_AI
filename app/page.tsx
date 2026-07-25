import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { auth } from "@/auth";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { Landing } from "@/components/landing/Landing";

export default async function LandingPage() {
  const session = await auth();
  const loggedIn = Boolean(session?.user);

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b-2 border-border bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <Logo />
          <Link href={loggedIn ? "/swipe" : "/login"}>
            <Button size="sm">
              {loggedIn ? "Open Swipe Demo" : "Login to see demo"}
              <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>
      </header>

      <Landing loggedIn={loggedIn} />

      {/* Footer */}
      <footer className="border-t-2 border-border bg-background">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-muted-foreground sm:flex-row">
          <Logo />
          <p className="font-medium">
            Frontend MVP · mock data · Career-Ops integration via adapter layer
          </p>
        </div>
      </footer>
    </div>
  );
}
