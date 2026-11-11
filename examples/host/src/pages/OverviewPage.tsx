import { Banner } from "@cloudflare/kumo/components/banner";

const STATS = [
  { label: "Requests (24h)", value: "1.2M" },
  { label: "Errors (24h)", value: "312" },
  { label: "Workers", value: "4" },
];

export function OverviewPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-kumo-strong">Overview</h1>
      <div className="getting-started">
        <Banner title="Getting started" description="Deploy your first Worker in under a minute." />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {STATS.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-kumo-line bg-kumo-base p-4">
            <p className="text-sm text-kumo-subtle">{stat.label}</p>
            <p className="mt-1 text-2xl font-semibold text-kumo-strong">{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
