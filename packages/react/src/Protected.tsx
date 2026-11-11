import type { ReactNode } from "react";
import { PROTECTED_ATTRIBUTE } from "./attributes";

type ProtectedProps = {
  children: ReactNode;
  /** Why this area can't be customized, shown to users who try (e.g. "Billing details"). */
  reason?: string;
};

/**
 * Marks part of the host's UI as off-limits: Intent UI never hides, moves, replaces or inserts
 * into anything inside it, and the Vite plugin doesn't tag elements written inside it.
 *
 * It renders a `display: contents` wrapper, so it doesn't affect layout. Protection is checked
 * against the DOM at runtime, so components rendered inside it from other files are covered too.
 */
export function Protected({ children, reason = "" }: ProtectedProps) {
  return (
    <div {...{ [PROTECTED_ATTRIBUTE]: reason }} style={{ display: "contents" }}>
      {children}
    </div>
  );
}

/** True if `element` is inside a protected area (or is one). */
export function isProtected(element: Element): boolean {
  return element.closest(`[${PROTECTED_ATTRIBUTE}]`) !== null;
}

/** The reason given for the protected area around `element`, if any. */
export function protectedReason(element: Element): string | null {
  return element.closest(`[${PROTECTED_ATTRIBUTE}]`)?.getAttribute(PROTECTED_ATTRIBUTE) ?? null;
}
