import { Link } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";

import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { LEGAL_LINKS } from "@/lib/legal";
import { SITE_LINKS, SUPPORT_EMAIL } from "@/lib/site-nav";

const FOOTER_LINKS = SITE_LINKS.filter((link) =>
  ["/how-it-works", "/features", "/pricing", "/contact"].includes(link.to),
);

export function SiteFooter() {
  return (
    <footer className="site-footer overflow-hidden">
      <div className="site-footer-grid" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl px-5 pt-20 sm:pt-24">
        <section className="mx-auto max-w-3xl text-center">
          <p className="site-footer-kicker">A clearer way to keep publishing</p>
          <h2 className="mt-4 font-display text-4xl font-semibold leading-[0.98] text-white text-balance sm:text-5xl lg:text-6xl">
            Ready for the next video to be waiting for you?
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-white/88 sm:text-lg">
            Start with a channel brief, review what is made, and keep your publishing calendar
            moving from one workspace.
          </p>
          <Button
            asChild
            size="lg"
            className="mt-8 bg-white text-primary shadow-[0_16px_35px_rgb(3_27_76_/_0.28)] hover:bg-brand-mist"
          >
            <Link to="/auth" search={{ mode: "signup" }}>
              Start free <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
          <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-medium text-white/90">
            <span className="inline-flex items-center gap-2">
              <Check className="size-4 text-brand-tertiary" aria-hidden="true" />
              1,000 credits each month
            </span>
            <span className="inline-flex items-center gap-2">
              <Check className="size-4 text-brand-tertiary" aria-hidden="true" />
              No card required
            </span>
          </div>
        </section>

        <div className="mt-20 border-t border-white/22 py-8 sm:mt-24">
          <div className="flex flex-col gap-7 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Link to="/" aria-label="Createtor home" className="inline-flex">
                <Logo variant="white" />
              </Link>
              <p className="mt-4 max-w-md text-sm leading-6 text-white/85">
                Daily faceless videos, editable before they reach your channel. Built for a
                consistent publishing rhythm, not another one-off prompt.
              </p>
            </div>
            <nav
              aria-label="Footer navigation"
              className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-white/90"
            >
              {FOOTER_LINKS.map((link) => (
                <Link key={link.to} to={link.to} className="site-footer-link">
                  {link.label}
                </Link>
              ))}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="site-footer-link">
                Support
              </a>
            </nav>
          </div>

          <nav
            aria-label="Legal"
            className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/16 pt-6 text-sm font-medium text-white/90"
          >
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
              Legal
            </span>
            <Link to="/legal" className="site-footer-link">
              Legal center
            </Link>
            {LEGAL_LINKS.map((link) => (
              <Link key={link.to} to={link.to} className="site-footer-link">
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex flex-col gap-2 pt-5 text-xs text-white/80 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} Createtor. All rights reserved.</p>
            <p>Create faster. Publish smarter.</p>
          </div>
        </div>
      </div>
      <p className="site-footer-display" aria-hidden="true">
        createtor
      </p>
    </footer>
  );
}
