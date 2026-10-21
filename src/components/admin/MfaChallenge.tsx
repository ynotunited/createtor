import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/errors";

import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

/**
 * Step-up screen shown when the signed-in admin has a verified MFA factor but
 * the current session is still `aal1`. Completing it upgrades the session so
 * admin server functions (which require `aal2`) succeed.
 */
export function MfaChallenge({ onVerified }: { onVerified: () => void }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      const totp = data?.totp?.find((factor) => factor.status === "verified");
      if (!totp) {
        if (!cancelled) setFailed(true);
        return;
      }
      const { data: challenge } = await supabase.auth.mfa.challenge({ factorId: totp.id });
      if (cancelled) return;
      setFactorId(totp.id);
      if (challenge) setChallengeId(challenge.id);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function verify() {
    if (!factorId || !challengeId) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.verify({ factorId, challengeId, code });
      if (error) throw error;
      await supabase.auth.refreshSession();
      toast.success("Identity verified");
      onVerified();
    } catch (error) {
      toast.error(toUserMessage(error, "Verification failed"));
      setCode("");
      const { data: challenge } = await supabase.auth.mfa.challenge({ factorId });
      if (challenge) setChallengeId(challenge.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hero-glow flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5" /> Two-factor verification
            </CardTitle>
            <CardDescription>
              Enter the 6-digit code from your authenticator app to continue.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {failed ? (
              <p role="alert" className="text-sm text-destructive">
                No verified authenticator found for this account.
              </p>
            ) : !ready ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="mfa-code">Authentication code</Label>
                  <Input
                    id="mfa-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && code.length === 6) void verify();
                    }}
                    placeholder="123456"
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={busy || code.length !== 6 || !challengeId}
                  onClick={() => verify()}
                >
                  Verify
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
