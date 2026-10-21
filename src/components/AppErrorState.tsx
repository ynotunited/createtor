import { useEffect, useState } from "react";
import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";

import { describeUserError } from "@/lib/errors";
import { reportClientError } from "@/lib/observability.functions";

type AppErrorStateProps = {
  error?: unknown;
  title?: string;
  fallback?: string;
  onRetry?: () => void;
  fullScreen?: boolean;
};

/**
 * Shared "what happened / what to do next" surface. Deliberately dependency-free
 * (no UI kit) so it still renders when a component or query has failed. The raw
 * error is only shown inside a collapsed <details>, and the reference code lets
 * a user quote a specific incident to support.
 */
export function AppErrorState({
  error,
  title = "This page didn't load",
  fallback,
  onRetry,
  fullScreen = true,
}: AppErrorStateProps) {
  const { message, reference, technical } = describeUserError(error, fallback);
  const [copied, setCopied] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(`Createtor ${reference}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      setShowDetail(true);
    }
  };

  return (
    <div
      className={[
        "flex items-center justify-center bg-background px-4",
        fullScreen ? "min-h-screen" : "py-16",
      ].join(" ")}
      role="alert"
    >
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          Reference <span className="font-mono text-foreground">{reference}</span>
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Try again
            </button>
          )}
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
          <button
            type="button"
            onClick={copyReference}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {copied ? "Copied" : "Copy reference"}
          </button>
        </div>

        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowDetail((value) => !value)}
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            {showDetail ? "Hide technical details" : "Technical details"}
          </button>
          {showDetail && (
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-input bg-muted/40 p-3 text-left text-[11px] leading-relaxed text-muted-foreground">
              {technical || reference}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Route/loader/query error boundary. Reports the failure to the issue pipeline
 * once, then offers a retry that invalidates the router and resets the boundary.
 */
export function RouteErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter();

  useEffect(() => {
    const message = error instanceof Error ? error.message : String(error);
    reportClientError({
      data: {
        message,
        ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
        ...(typeof window !== "undefined" ? { path: window.location.pathname } : {}),
      },
    }).catch(() => undefined);
  }, [error]);

  return (
    <AppErrorState
      error={error}
      onRetry={() => {
        router.invalidate();
        reset();
      }}
    />
  );
}
