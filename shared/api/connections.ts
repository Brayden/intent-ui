import { z } from "zod";
import type { ToolInfo } from "./tools";

/*
 * Data connections (ADR 0014): remote MCP servers the user connects once, used by every
 * workspace. Signed in with OAuth (MCP authorization) or an access token; governed by a thin
 * gatekeeper (which tools are on, read vs write, confirmation for destructive ones, activity log).
 */

export const AuthKindSchema = z.enum(["oauth", "token", "none"]);
export type AuthKind = z.infer<typeof AuthKindSchema>;

/**
 * What the credential itself may do. "read": OAuth asks only for read permissions (a token should
 * be read-only), so every tool is safe to use for page data, even general ones like an API
 * `execute`. "write": tools are read or write as the server describes them.
 */
export const AccessSchema = z.enum(["read", "write"]);
export type Access = z.infer<typeof AccessSchema>;

export type ConnectionPreset = {
  id: string;
  name: string;
  description: string;
  url: string;
  /** Supported sign-in methods, preferred first. */
  auth: AuthKind[];
  /** How to get a token, shown next to the token field. */
  tokenHelp?: string;
  /** OAuth needs a pre-registered app (no dynamic registration): ask for client ID + secret. */
  oauthNeedsClient?: boolean;
};

export const PRESETS: ConnectionPreset[] = [
  {
    id: "github",
    name: "GitHub",
    description: "Repositories, issues, pull requests, and more (GitHub's remote MCP server).",
    url: "https://api.githubcopilot.com/mcp/",
    auth: ["token", "oauth"],
    tokenHelp: "A personal access token from github.com/settings/tokens, with the scopes you want to allow (e.g. repo, read:org).",
    oauthNeedsClient: true,
  },
  {
    id: "linear",
    name: "Linear",
    description: "Issues, projects, cycles, and comments.",
    url: "https://mcp.linear.app/mcp",
    auth: ["oauth", "token"],
    tokenHelp: "A Linear API key (Settings → Security & access). A key with only Read permission keeps it read-only.",
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    description: "Your Cloudflare account: Workers, DNS, analytics, logs, and more (Cloudflare's MCP server).",
    url: "https://mcp.cloudflare.com/mcp",
    auth: ["oauth", "token"],
    tokenHelp: "A Cloudflare API token (dash.cloudflare.com → My Profile → API Tokens), scoped to what you want to allow.",
  },
];

export type ConnectionStatus = "connected" | "needs_auth" | "error";

/** A tool as the connections page shows it, with the gatekeeper's policy applied. */
export type ConnectionTool = ToolInfo & {
  title?: string;
  /** Visible to the model and callable. Read tools default on, writes off. */
  enabled: boolean;
  /** Whether read/write came from the server's annotations (vs our guess from its name). */
  annotated: boolean;
  /** Why it counts as read: the server says so, the connection is read-only, or the user said so. */
  readOnlyBy?: "server" | "connection" | "user" | "name";
};

export type ConnectionSummary = {
  id: string;
  name: string;
  url: string;
  auth: AuthKind;
  /** Effective access: "read" when chosen, or when the service only granted read permissions. */
  access: Access;
  /** Read & write was chosen, but the service granted only read permissions (so it's read-only). */
  grantedReadOnly?: boolean;
  preset?: string;
  status: ConnectionStatus;
  error?: string;
  tools: ConnectionTool[];
  toolsUpdatedAt?: string;
  /** Built into the app (web, demo data): not removable. */
  builtin?: boolean;
  /** Sample data (not your account) so the example works; `preset` is the real service that replaces it. */
  demo?: boolean;
  /** For demo connections: hidden because a real connection replaced it. */
  replacedBy?: string;
};

/** POST /api/connections */
export const CreateConnectionRequestSchema = z.object({
  preset: z.string().optional(),
  name: z.string().min(1).max(80).optional(),
  url: z.string().url().refine((url) => url.startsWith("https://") || url.startsWith("http://localhost"), "MCP servers must use https").optional(),
  auth: AuthKindSchema,
  access: AccessSchema.default("read"),
  token: z.string().min(1).optional(),
  clientId: z.string().min(1).optional(),
  clientSecret: z.string().min(1).optional(),
});
export type CreateConnectionRequest = z.input<typeof CreateConnectionRequestSchema>;
/** `authUrl`: send the user there to sign in (OAuth); they come back to the home page. */
export type CreateConnectionResponse = { connection: ConnectionSummary; authUrl?: string };

/** PUT /api/connections/:id/tools/:tool — the user's policy for one tool. */
export const ToolPolicyRequestSchema = z.object({ enabled: z.boolean().optional(), readOnly: z.boolean().optional() });
export type ToolPolicyRequest = z.input<typeof ToolPolicyRequestSchema>;

/** One gatekeeper log entry. */
export type ActivityEntry = { at: string; connection: string; tool: string; kind: "read" | "write"; ok: boolean; ms: number; error?: string };
