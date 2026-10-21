import { createFileRoute } from "@tanstack/react-router";

import { legalRouteOptions } from "@/lib/legal-route";

export const Route = createFileRoute("/_marketing/refunds")(legalRouteOptions("refunds"));
