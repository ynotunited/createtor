import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "error-callback"?: () => void;
      "expired-callback"?: () => void;
      theme?: "auto" | "light" | "dark";
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// Public site key, injected at build time. When absent the CAPTCHA is simply
// not rendered and auth calls omit the token, so enabling it later is a
// one-line env change plus the dashboard toggle — never a broken sign-in.
const SITE_KEY: string | undefined = import.meta.env["VITE_TURNSTILE_SITE_KEY"];

export const captchaEnabled = Boolean(SITE_KEY);

let loader: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (!loader) {
    loader = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Turnstile"));
      document.head.appendChild(script);
    });
  }
  return loader;
}

/**
 * Cloudflare Turnstile widget. Renders nothing when no site key is configured.
 * Increment `resetSignal` to force a fresh challenge after a submit attempt.
 */
export function Turnstile({
  onToken,
  resetSignal = 0,
}: {
  onToken: (token: string | null) => void;
  resetSignal?: number;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);
  const tokenHandler = useRef(onToken);
  tokenHandler.current = onToken;

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;
    void loadTurnstile()
      .then(() => {
        if (cancelled || !container.current || !window.turnstile || widgetId.current) return;
        widgetId.current = window.turnstile.render(container.current, {
          sitekey: SITE_KEY,
          callback: (token) => tokenHandler.current(token),
          "error-callback": () => tokenHandler.current(null),
          "expired-callback": () => tokenHandler.current(null),
        });
      })
      .catch(() => tokenHandler.current(null));
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (resetSignal > 0 && widgetId.current && window.turnstile) {
      window.turnstile.reset(widgetId.current);
      tokenHandler.current(null);
    }
  }, [resetSignal]);

  if (!SITE_KEY) return null;
  return <div ref={container} className="flex justify-center" />;
}
