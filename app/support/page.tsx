import Link from "next/link";
import {
  LEGAL_H2,
  LEGAL_P,
  LegalPage,
} from "@/components/legal/LegalPage";
import { ContactEmail } from "@/components/legal/PrivacyPolicy";

export const metadata = { title: "Support · ITJobCafe" };

export default function SupportPage() {
  return (
    <LegalPage title="Support">
      <h2 className={LEGAL_H2}>Get help</h2>
      <p className={LEGAL_P}>
        Email us at <ContactEmail /> and we&apos;ll get back to you.
      </p>

      <h2 className={LEGAL_H2}>Delete your account</h2>
      <p className={LEGAL_P}>
        Sign in, open <strong>Settings</strong>, and choose{" "}
        <strong>Delete account</strong> — on the website at{" "}
        <Link href="/settings" className="font-medium text-accent hover:underline">
          itjobcafe.ai/settings
        </Link>{" "}
        or in the app&apos;s Settings tab. You&apos;ll be asked to confirm with
        your password, or with your email address if your account has no
        password. If you can&apos;t remember your password, email us at{" "}
        <ContactEmail /> and we&apos;ll delete the account for you. Deletion is
        immediate and permanent.
      </p>

      <h2 className={LEGAL_H2}>Privacy</h2>
      <p className={LEGAL_P}>
        See our{" "}
        <Link href="/privacy" className="font-medium text-accent hover:underline">
          privacy policy
        </Link>{" "}
        for what we collect and how it&apos;s used.
      </p>
    </LegalPage>
  );
}
