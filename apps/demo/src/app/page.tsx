import {
  LandingDemos,
  LandingFooter,
  LandingHero,
  LandingNav,
  LandingPrinciples,
} from "@/core/landing/ui/landing";

export default function LandingPage() {
  return (
    <main className="landing">
      <LandingNav />
      <LandingHero />
      <LandingPrinciples />
      <LandingDemos />
      <LandingFooter />
    </main>
  );
}
