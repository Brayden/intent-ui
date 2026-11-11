import { Protected } from "../../../../packages/react/src";

/** Billing is wrapped in <Protected>: Intent UI can't hide, move or replace anything here. */
export function BillingPage() {
  return (
    <Protected reason="Billing">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-kumo-strong">Billing</h1>
        <div className="rounded-lg border border-kumo-line bg-kumo-base p-4">
          <p className="text-sm text-kumo-subtle">Plan</p>
          <p className="mt-1 text-lg font-semibold text-kumo-strong">Workers Paid · $5/month</p>
        </div>
        <p className="text-sm text-kumo-subtle">This page is protected. Nothing on it can be customized.</p>
      </div>
    </Protected>
  );
}
