import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, googleConfigured } from "@/auth";
import { Logo } from "@/components/layout/Logo";
import { LoginForm } from "@/components/auth/LoginForm";
import { LegalLinks } from "@/components/legal/LegalLinks";

export const metadata = { title: "Log in · ITJobCafe" };

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/swipe");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-wash px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Link href="/" aria-label="ITJobCafé home" className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <Logo height={44} className="mix-blend-multiply" />
          </Link>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">
            Welcome back
          </h1>
          <p className="mt-1 text-sm text-muted">
            Log in to your account.
          </p>
        </div>

        <div className="rounded-3xl border border-border bg-card p-6 shadow-card">
          <LoginForm googleEnabled={googleConfigured} />
        </div>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link
            href="/signup"
            className="rounded-sm font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Create an account
          </Link>
        </p>
        <LegalLinks className="mt-6" />
      </div>
    </main>
  );
}
