import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { getOrCreateWorkspace, type Workspace } from "@/lib/workspace.functions";

export type { Workspace };

/**
 * Loads the signed-in user's active workspace, creating a default one (with its
 * free monthly credits) on first visit. Creation runs server-side with the
 * service role so plan and credit state can never be written from the browser.
 */
export function useWorkspace() {
  const { user } = useAuth();
  return useQuery({
    // Scoped to the user id so a sign-out / sign-in as another account can
    // never serve the previous tenant's workspace from the React Query cache.
    queryKey: ["workspace", user?.id],
    enabled: Boolean(user),
    queryFn: (): Promise<Workspace | null> => getOrCreateWorkspace(),
    staleTime: 15_000,
  });
}
