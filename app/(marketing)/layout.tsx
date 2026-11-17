import { auth } from "@/auth";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <>
      <SiteHeader loggedIn={Boolean(session?.user)} />
      <p className="bg-banner px-5 py-3 text-center text-[19px] font-bold tracking-[0.01em] text-white">
        <span aria-hidden="true">✦</span> Your skills. Your score. Your next big
        move. <span aria-hidden="true">✦</span>
      </p>
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
