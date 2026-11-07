import { Banner } from "@cloudflare/kumo/components/banner";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import { LayerDialog } from "@cloudflare/kumo/components/layer-dialog";
import { Radio } from "@cloudflare/kumo/components/radio";
import { SensitiveInput } from "@cloudflare/kumo/components/sensitive-input";
import { Text } from "@cloudflare/kumo/components/text";
import { useState } from "react";
import { PRESETS, type Access, type AuthKind, type ConnectionPreset, type CreateConnectionRequest } from "../../../../shared/api";

const AUTH_LABELS: Record<AuthKind, string> = {
  oauth: "Sign in (OAuth)",
  token: "Access token",
  none: "No sign-in",
};

type AddConnectionDialogProps = {
  /** Open straight at this service's form (e.g. "Connect yours" on a demo row). */
  initialPreset?: string;
  onClose: () => void;
  /** Resolves when the connection is added (or the browser is on its way to sign in). */
  onSubmit: (request: CreateConnectionRequest) => Promise<void>;
};

/**
 * Pick a service (or any MCP server URL) and how to sign in. OAuth sends the browser to the
 * service and back; a token is stored on the server and never shown again.
 */
export function AddConnectionDialog({ initialPreset, onClose, onSubmit }: AddConnectionDialogProps) {
  const initial = PRESETS.find((candidate) => candidate.id === initialPreset);
  const [preset, setPreset] = useState<ConnectionPreset | "custom" | null>(initial ?? null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [auth, setAuth] = useState<AuthKind>(initial?.auth[0] ?? "oauth");
  const [access, setAccess] = useState<Access>("read");
  const [token, setToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = (choice: ConnectionPreset | "custom") => {
    setPreset(choice);
    setUrl(choice === "custom" ? "" : choice.url);
    setAuth(choice === "custom" ? "oauth" : (choice.auth[0] ?? "oauth"));
    setError(null);
  };

  const methods: AuthKind[] = preset && preset !== "custom" ? preset.auth : ["oauth", "token", "none"];
  const presetName = preset && preset !== "custom" ? preset.name : "This server";
  const needsClient = auth === "oauth" && preset !== null && preset !== "custom" && preset.oauthNeedsClient;
  const ready = Boolean(url) && (auth !== "token" || token) && (!needsClient || clientId) && (preset !== "custom" || name);

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      await onSubmit({
        preset: preset && preset !== "custom" ? preset.id : undefined,
        name: preset === "custom" ? name : undefined,
        url,
        auth,
        access,
        token: auth === "token" ? token : undefined,
        clientId: auth === "oauth" && clientId ? clientId : undefined,
        clientSecret: auth === "oauth" && clientSecret ? clientSecret : undefined,
      });
    } catch (cause) {
      setError((cause as Error).message);
      setPending(false);
    }
  };

  return (
    <LayerDialog.Root open onOpenChange={(open) => !open && !pending && onClose()}>
      <LayerDialog.Content size="lg">
        <LayerDialog.Title>{preset === null ? "Add a connection" : preset === "custom" ? "Custom MCP server" : `Connect ${preset.name}`}</LayerDialog.Title>
        <LayerDialog.Description>
          {preset === null
            ? "Connections let your workspaces use your own data. Any remote MCP server works."
            : "Its tools become available to every workspace. Read tools start on; writes stay off until you turn them on."}
        </LayerDialog.Description>
        <LayerDialog.Body>
          {preset === null ? (
            <ul className="flex flex-col gap-2">
              {[...PRESETS, "custom" as const].map((choice) => (
                <li key={choice === "custom" ? "custom" : choice.id}>
                  <button
                    type="button"
                    onClick={() => choose(choice)}
                    className="flex w-full flex-col gap-0.5 rounded-lg border border-kumo-hairline bg-kumo-base p-3 text-left transition hover:border-kumo-line hover:bg-kumo-tint"
                  >
                    <Text bold>{choice === "custom" ? "Custom MCP server" : choice.name}</Text>
                    <Text variant="secondary" size="sm">
                      {choice === "custom" ? "Any remote MCP server URL (Streamable HTTP)." : choice.description}
                    </Text>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (ready && !pending) void submit();
              }}
            >
              {preset === "custom" && <Input label="Name" placeholder="e.g. Sentry" value={name} onChange={(event) => setName(event.target.value)} />}
              <Input
                label="MCP server URL"
                description={preset === "custom" ? "The server's Streamable HTTP endpoint, usually ending in /mcp." : undefined}
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
              {methods.length > 1 && (
                <Radio.Group legend="Sign in with" orientation="horizontal" value={auth} onValueChange={(value) => setAuth(value as AuthKind)}>
                  {methods.map((method) => (
                    <Radio.Item key={method} label={AUTH_LABELS[method]} value={method} />
                  ))}
                </Radio.Group>
              )}
              <Radio.Group
                legend="Access"
                description={
                  access === "read"
                    ? auth === "oauth"
                      ? "Signs in asking only for read permissions, so every tool is safe to use for page data. Recommended."
                      : auth === "token"
                        ? "Use a token that can only read: then every tool is safe to use for page data. Recommended."
                        : "Every tool is treated as read-only."
                    : "Can change things in this service. Write tools stay off until you turn them on, and only run when you click."
                }
                orientation="horizontal"
                value={access}
                onValueChange={(value) => setAccess(value as Access)}
              >
                <Radio.Item label="Read only" value="read" />
                <Radio.Item label="Read & write" value="write" />
              </Radio.Group>
              {auth === "token" && (
                <SensitiveInput
                  label="Access token"
                  description={preset !== "custom" ? preset.tokenHelp : "Sent as Authorization: Bearer <token>."}
                  value={token}
                  onValueChange={setToken}
                />
              )}
              {auth === "oauth" && (needsClient || preset === "custom") && (
                <div className="flex flex-col gap-3">
                  <Text variant="secondary" size="sm">
                    {needsClient
                      ? `${presetName} doesn't support automatic sign-in setup, so use your own OAuth app. Its callback URL must be ${window.location.origin}/api/connections/oauth/callback.`
                      : "Optional: only if the server doesn't support automatic sign-in setup."}
                  </Text>
                  <Input label="OAuth client ID" value={clientId} onChange={(event) => setClientId(event.target.value)} />
                  <SensitiveInput label="OAuth client secret" value={clientSecret} onValueChange={setClientSecret} />
                </div>
              )}
              {error && <Banner variant="error" title="Couldn't connect" description={error} />}
              <div className="flex justify-between gap-2">
                <Button variant="ghost" onClick={() => setPreset(null)} disabled={pending}>
                  ← All services
                </Button>
                <Button type="submit" variant="primary" loading={pending} disabled={!ready}>
                  {auth === "oauth" ? "Continue to sign in" : "Connect"}
                </Button>
              </div>
            </form>
          )}
        </LayerDialog.Body>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}
