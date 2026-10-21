import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { captchaEnabled, Turnstile } from "@/components/auth/Turnstile";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trackClient } from "@/lib/analytics-client";
import { authorizeAuthAttempt, reportAuthOutcome } from "@/lib/auth.functions";
import { getLandingPath } from "@/lib/admin.functions";
import { setUserTimezone } from "@/lib/profile.functions";
import { googleOAuthOptions } from "@/lib/oauth";
import { detectTimeZone } from "@/lib/schedule";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

/** Sends the signed-in user to the right home for their role (admin vs creator). */
async function goToLanding(navigate: ReturnType<typeof useNavigate>): Promise<void> {
  try {
    const { path } = await getLandingPath();
    if (path !== "/dashboard") {
      window.location.assign(path);
      return;
    }
  } catch {
    // Fall through to the creator app if the role lookup fails.
  }
  await navigate({ to: "/dashboard" });
}

const searchSchema = z.object({
  mode: z.enum(["signin", "signup", "reset"]).optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — Createtor" },
      {
        name: "description",
        content: "Sign in or create your Createtor account to start generating videos.",
      },
      { property: "og:title", content: "Sign in — Createtor" },
      { property: "og:description", content: "Access your Createtor workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode = "signin" } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [ageConfirmed, setAgeConfirmed] = useState(false);

  useEffect(() => {
    // Supabase redirects password-reset links back to /auth with a hash of
    // `type=recovery` (plus tokens it consumes into a session). Detect it
    // before the auto-redirect so we can show the "set a new password" form.
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    if (params.get("type") === "recovery") {
      setRecovering(true);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) void goToLanding(navigate);
    });
  }, [navigate]);

  const friendlyError = (action: string, error: unknown): string => {
    const message = error instanceof Error ? error.message : "Something went wrong.";
    if (action === "signin" && /invalid login credentials/i.test(message))
      return "Incorrect email or password.";
    if (action === "signup") {
      if (/already registered/i.test(message))
        return "An account with this email may already exist. Check your inbox for a confirmation link.";
      if (/password/i.test(message)) return "Choose a password with at least 8 characters.";
    }
    return message;
  };

  const authKind = mode === "signup" ? "signup" : mode === "reset" ? "reset" : "signin";

  // Identity + IP abuse gate. Fails open so a limiter outage never blocks a
  // legitimate sign-in; Supabase's own auth limits remain the backstop.
  async function gate(kind: "signin" | "signup" | "reset") {
    try {
      return await authorizeAuthAttempt({ data: { kind, email } });
    } catch {
      return { allowed: true } as const;
    }
  }

  function report(kind: "signin" | "signup" | "reset", success: boolean) {
    reportAuthOutcome({ data: { kind, email, success } }).catch(() => undefined);
    if (success) trackClient(`auth.${kind}`);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (captchaEnabled && !captchaToken) {
      toast.error("Please complete the verification challenge.");
      return;
    }
    if (mode === "signup" && !ageConfirmed) {
      toast.error("Please confirm you are at least 18 years old to create an account.");
      return;
    }
    setBusy(true);
    const captchaOptions = captchaToken ? { captchaToken } : {};
    try {
      const decision = await gate(authKind);
      if (!decision.allowed) {
        toast.error(
          decision.reason === "locked"
            ? "Too many attempts. Please wait a few minutes and try again."
            : "Too many attempts. Please slow down and try again shortly.",
        );
        return;
      }

      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth`,
          ...captchaOptions,
        });
        if (error) throw error;
        report("reset", true);
        toast.success("Password reset email sent.");
        return;
      }

      if (mode === "signup") {
        // Time zone is captured at signup so every future scheduled post uses the
        // user's own wall clock. It rides along in the auth metadata (the DB
        // trigger stores it) and is also written once a session exists.
        const timezone = detectTimeZone();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: fullName, timezone },
            ...captchaOptions,
          },
        });
        if (error) throw error;
        report("signup", true);
        if (data.session) setUserTimezone({ data: { timezone } }).catch(() => undefined);
        if (!data.session) {
          toast.success("Check your email to confirm your account.");
          return;
        }
        await goToLanding(navigate);
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: { ...captchaOptions },
      });
      if (error) throw error;
      report("signin", true);
      await goToLanding(navigate);
    } catch (error) {
      report(authKind, false);
      toast.error(friendlyError(mode, error));
    } finally {
      setBusy(false);
      setCaptchaToken(null);
      setCaptchaReset((n) => n + 1);
    }
  }

  async function handleRecover(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      toast.error("Choose a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated. You're signed in.");
      await goToLanding(navigate);
    } catch (error) {
      toast.error(friendlyError("recover", error));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    // Exact, configured return URL (locked to the provider allowlist) and the
    // minimum identity scopes. See src/lib/oauth.ts.
    const options = googleOAuthOptions({
      configuredUrl: import.meta.env["VITE_OAUTH_REDIRECT_URL"] as string | undefined,
      origin: window.location.origin,
    });
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options });
    if (error) {
      setBusy(false);
      toast.error("Google sign-in failed. Please try again.");
    }
  }

  return (
    <main className="hero-glow flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex justify-center">
          <Logo />
        </Link>
        <Card className="glass-panel">
          <CardHeader>
            <h1 className="font-semibold leading-none tracking-tight">
              {recovering
                ? "Set a new password"
                : mode === "signup"
                  ? "Create your account"
                  : mode === "reset"
                    ? "Reset your password"
                    : "Welcome back"}
            </h1>
            <CardDescription>
              {recovering
                ? "Choose a new password for your account."
                : mode === "reset"
                  ? "We'll email you a link to set a new password."
                  : "Your workspace, channels and daily queue live here."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {mode !== "reset" && !recovering && (
              // These swap the route's `mode` search param rather than a tab
              // panel, so they are links (not tabs) — correct semantics and no
              // dangling aria-controls target for axe.
              <nav
                aria-label="Sign in or sign up"
                className="grid w-full grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-muted-foreground"
              >
                {(
                  [
                    ["signin", "Sign in"],
                    ["signup", "Sign up"],
                  ] as const
                ).map(([value, title]) => (
                  <Link
                    key={value}
                    to="/auth"
                    search={{ mode: value }}
                    aria-current={mode === value ? "page" : undefined}
                    className={cn(
                      "inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md px-3 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      mode === value
                        ? "bg-background text-foreground shadow"
                        : "hover:text-foreground",
                    )}
                  >
                    {title}
                  </Link>
                ))}
              </nav>
            )}

            <form onSubmit={recovering ? handleRecover : handleSubmit} className="space-y-4">
              {recovering ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="password">New password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      minLength={8}
                      autoComplete="new-password"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm">Confirm new password</Label>
                    <Input
                      id="confirm"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat your new password"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </>
              ) : (
                <>
                  {mode === "signup" && (
                    <div className="space-y-2">
                      <Label htmlFor="name">Full name</Label>
                      <Input
                        id="name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Alex Rivera"
                        required
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@studio.com"
                      autoComplete="email"
                      required
                    />
                  </div>
                  {mode !== "reset" && (
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete={mode === "signup" ? "new-password" : "current-password"}
                        minLength={8}
                        required
                      />
                    </div>
                  )}
                </>
              )}
              {captchaEnabled && !recovering && (
                <Turnstile onToken={setCaptchaToken} resetSignal={captchaReset} />
              )}
              {mode === "signup" && !recovering && (
                <div className="flex items-start gap-2.5">
                  <Checkbox
                    id="age-confirm"
                    checked={ageConfirmed}
                    onCheckedChange={(value) => setAgeConfirmed(value === true)}
                    className="mt-0.5"
                  />
                  <Label
                    htmlFor="age-confirm"
                    className="text-sm font-normal leading-snug text-muted-foreground"
                  >
                    I confirm I am at least 18 years old and I agree to the{" "}
                    <Link to="/terms" className="text-foreground underline underline-offset-2">
                      Terms
                    </Link>{" "}
                    and{" "}
                    <Link to="/privacy" className="text-foreground underline underline-offset-2">
                      Privacy Policy
                    </Link>
                    .
                  </Label>
                </div>
              )}
              <Button type="submit" className="w-full" disabled={busy}>
                {recovering
                  ? "Update password"
                  : mode === "signup"
                    ? "Create account"
                    : mode === "reset"
                      ? "Send reset link"
                      : "Sign in"}
              </Button>
            </form>

            {mode !== "reset" && (
              <>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" /> or{" "}
                  <span className="h-px flex-1 bg-border" />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={handleGoogle}
                  disabled={busy}
                >
                  Continue with Google
                </Button>
              </>
            )}

            <div className="text-center text-xs text-muted-foreground">
              {mode === "reset" ? (
                <Link to="/auth" search={{ mode: "signin" }} className="hover:text-foreground">
                  Back to sign in
                </Link>
              ) : (
                <Link to="/auth" search={{ mode: "reset" }} className="hover:text-foreground">
                  Forgot your password?
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link to="/" className="inline-flex items-center gap-1.5 hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to home
          </Link>
        </p>
      </div>
    </main>
  );
}
