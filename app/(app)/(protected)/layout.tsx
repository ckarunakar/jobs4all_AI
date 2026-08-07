import { redirect } from "next/navigation";
import { auth } from "@/auth";

/** Account pages require a session; guests are sent to /login. */
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return children;
}
