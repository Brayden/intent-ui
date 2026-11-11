import { Badge } from "@cloudflare/kumo/components/badge";
import { Table } from "@cloudflare/kumo/components/table";

const WORKERS = [
  { name: "api-gateway", status: "Healthy", requests: "820k", errors: 12 },
  { name: "image-resizer", status: "Healthy", requests: "301k", errors: 3 },
  { name: "cron-cleanup", status: "Degraded", requests: "1.4k", errors: 290 },
  { name: "auth", status: "Healthy", requests: "96k", errors: 7 },
];

/** The host's own static page. The Vite plugin tags its elements so Intent UI can target them. */
export function WorkersPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-kumo-strong">Workers</h1>
      <div className="overflow-hidden rounded-lg border border-kumo-line bg-kumo-base">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.Head>Name</Table.Head>
              <Table.Head>Status</Table.Head>
              <Table.Head>Requests (24h)</Table.Head>
              <Table.Head>Errors (24h)</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {WORKERS.map((worker) => (
              <Table.Row key={worker.name}>
                <Table.Cell>{worker.name}</Table.Cell>
                <Table.Cell>
                  <Badge variant={worker.status === "Healthy" ? "success" : "warning"}>{worker.status}</Badge>
                </Table.Cell>
                <Table.Cell>{worker.requests}</Table.Cell>
                <Table.Cell>{worker.errors}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </div>
    </div>
  );
}
