import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, googleConfigured } from "@/auth";
import { Logo } from "@/components/layout/Logo";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata = { title: "Log in · ITJobCafe" };

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/swipe");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo />
          <h1 className="mt-4 text-2xl font-bold tracking-tight">
            Welcome back
          </h1>
          <p className="mt-1 text-sm text-muted">
            Log in to open the swipe demo.
          </p>
        </div>

        <div className="rounded-lg border-2 border-border bg-card p-5">
          <LoginForm googleEnabled={googleConfigured} />
        </div>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link
            href="/signup"
            className="font-medium text-accent hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
