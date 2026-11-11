import { Button } from "@cloudflare/kumo/components/button";
import { Empty } from "@cloudflare/kumo/components/empty";
import { LayerDialog } from "@cloudflare/kumo/components/layer-dialog";
import { Switch } from "@cloudflare/kumo/components/switch";
import { Tabs } from "@cloudflare/kumo/components/tabs";
import { Text } from "@cloudflare/kumo/components/text";
import { useContext, useState } from "react";
import { ConnectionsSection } from "../../../src/features/connections";
import { IntentUIContextInternal } from "./context";

type Tab = "sources" | "customizations";

/**
 * Intent UI's settings, opened wherever the host chooses (a menu item, a button, ⌘K):
 * - Data sources: connect MCP servers (OAuth or token) and choose access and tools, the same
 *   gatekeeper as the standalone app.
 * - Customizations: the master switch, and what's applied on this page.
 *
 * The provider mounts one instance (`useIntentUI().openSettings()`); hosts may also render it.
 */
export function IntentUISettings({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const context = useContext(IntentUIContextInternal);
  const [tab, setTab] = useState<Tab>("sources");
  if (!context) return null;
  const { mutationsEnabled, setMutationsEnabled, patchStatus, patches, removePatch } = context;
  const onThisPage = patches.filter((patch) => patch.page === undefined || patch.page === window.location.pathname);

  return (
    <LayerDialog.Root open={open} onOpenChange={onOpenChange}>
      <LayerDialog.Content size="xl">
        <LayerDialog.Title>Intent UI settings</LayerDialog.Title>
        <LayerDialog.Description>Connect data sources and manage what you've customized on this site.</LayerDialog.Description>
        <LayerDialog.Body>
          <div className="flex flex-col gap-5">
            <Tabs
              variant="segmented"
              tabs={[
                { value: "sources", label: "Data sources" },
                { value: "customizations", label: "Customizations" },
              ]}
              value={tab}
              onValueChange={(value) => setTab(value as Tab)}
            />
            {tab === "sources" ? (
              <ConnectionsSection />
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-6 rounded-lg border border-kumo-line p-4">
                  <div>
                    <Text variant="heading" as="h3">
                      Show my customizations
                    </Text>
                    <Text variant="secondary" size="sm">
                      Turn off to see this site exactly as it ships, without generated pages or changes. Nothing is deleted.
                    </Text>
                  </div>
                  <Switch label={mutationsEnabled ? "On" : "Off"} checked={mutationsEnabled} onCheckedChange={setMutationsEnabled} />
                </div>
                {onThisPage.length === 0 ? (
                  <Empty size="sm" title="No changes on this page" description="Right-click anything on the page to change it." />
                ) : (
                  <ul className="flex flex-col divide-y divide-kumo-line rounded-lg border border-kumo-line">
                    {onThisPage.map((patch) => (
                      <li key={patch.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div className="min-w-0">
                          <Text size="sm">{patch.prompt ?? `${patch.op} ${patch.target}`}</Text>
                          <Text variant="secondary" size="xs">
                            {patch.op === "hide" ? "Hidden" : patch.op === "replace" ? "Replaced" : "Added"}
                            {patchStatus.orphaned.includes(patch.id) ? " · not found on this page anymore" : ""}
                            {patchStatus.refused.includes(patch.id) ? " · skipped: protected area" : ""}
                          </Text>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => removePatch(patch.id)}>
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </LayerDialog.Body>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}
