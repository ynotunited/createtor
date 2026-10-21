import { Link } from "@tanstack/react-router";
import { PlugZap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Honest status panel for capabilities whose external provider is not connected
 * yet. It never fakes an action — it explains what the module will do and what
 * has to be connected first.
 */
export function ModuleStatus({
  title,
  description,
  phase,
  requires,
  capabilities,
}: {
  title: string;
  description: string;
  phase: string;
  requires: string[];
  capabilities: string[];
}) {
  return (
    <Card className="glass-panel">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-primary/40 text-primary">
            {phase}
          </Badge>
        </div>
        <CardTitle className="mt-3">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What this module does
          </p>
          <ul className="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
            {capabilities.map((c) => (
              <li key={c} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                {c}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Needs to be connected
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
            {requires.map((r) => (
              <li key={r} className="flex items-center gap-2">
                <PlugZap className="size-4 text-primary" />
                {r}
              </li>
            ))}
          </ul>
        </div>
        <Button asChild variant="secondary">
          <Link to="/settings">Open provider settings</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
