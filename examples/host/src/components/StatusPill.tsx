/**
 * Acme's own status pill (a stand-in for a host design-system component). The host binds it to
 * the catalog's "Badge" type, so generated UI uses it wherever the model picks a Badge.
 */
const TONES = {
  neutral: "bg-kumo-tint text-kumo-default",
  success: "bg-kumo-success/15 text-kumo-success",
  warning: "bg-kumo-warning/15 text-kumo-warning",
  error: "bg-kumo-danger/15 text-kumo-danger",
  info: "bg-kumo-info/15 text-kumo-info",
} as const;

export function StatusPill({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return (
    <span data-acme="status-pill" className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
