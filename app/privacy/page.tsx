import { LegalPage } from "@/components/legal/LegalPage";
import { PrivacyPolicy } from "@/components/legal/PrivacyPolicy";

export const metadata = { title: "Privacy policy · ITJobCafe" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy">
      <PrivacyPolicy />
    </LegalPage>
  );
}
