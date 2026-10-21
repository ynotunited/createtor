/**
 * Pure policy helpers for account erasure. Kept import-free so they are easy to
 * unit test and to reuse from both the self-service and admin paths.
 */

/** True when the operator echoed the target's current email (case/space-insensitive). */
export function confirmationMatches(
  currentEmail: string | null | undefined,
  typedEmail: string | null | undefined,
): boolean {
  if (!currentEmail || !typedEmail) return false;
  return currentEmail.trim().toLowerCase() === typedEmail.trim().toLowerCase();
}

/**
 * A super-admin must never be erased through the console, and an operator must
 * never erase themselves. Returns a reason string when erasure is blocked, or
 * null when it is allowed.
 */
export function erasureBlockReason(input: {
  targetId: string;
  actorId: string;
  targetRoles: readonly string[];
}): string | null {
  if (input.targetId === input.actorId) return "You cannot erase your own account here.";
  if (input.targetRoles.includes("super_admin")) {
    return "Super administrators cannot be erased. Revoke the role first.";
  }
  return null;
}
