import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Logo } from "@/components/layout/Logo";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata = { title: "Sign up · ITJobCafe" };

export default async function SignupPage() {
  const session = await auth();
  if (session?.user) redirect("/swipe");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo />
          <h1 className="mt-4 text-2xl font-bold tracking-tight">
            Create your account
          </h1>
          <p className="mt-1 text-sm text-muted">
            Sign up to start swiping high-fit jobs.
          </p>
        </div>

        <div className="rounded-lg border-2 border-border bg-card p-5">
          <SignupForm />
        </div>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-accent hover:underline"
          >
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
