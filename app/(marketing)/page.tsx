import { LandingHero } from "@/components/marketing/landing/LandingHero";
import { StatsStrip } from "@/components/marketing/landing/StatsStrip";

// Title and description come from the root layout's metadata.
export default function HomePage() {
  return (
    <>
      <LandingHero />
      <StatsStrip />
    </>
  );
}
