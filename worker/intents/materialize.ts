import type { MaterializeRequest, MaterializeResponse, Template, ToolInfo } from "../../shared/api";
import type { Env } from "../env";
import { runToolLoop } from "../llm/toolLoop";
import type { StyleEngine } from "../styles/engine";
import { materializeSystemPrompt, materializeUserPrompt } from "./prompt";
import { EMIT_TOOL, handleEmit, handleReuse, REUSE_TOOL } from "./templateTools";

type Resolved = { template: Template; reused: boolean; reason?: string; css: string };

/**
 * Resolves a deferred intent to UI (RFC 0001 §8.3, ADR 0003). The model either reuses a
 * compatible existing template or emits a new one; both are validated (incl. brand policy,
 * ADR 0006) and repaired, and returned with the CSS they need.
 */
export async function materialize(
  env: Env,
  request: MaterializeRequest,
  tools: ToolInfo[],
  styles: StyleEngine,
): Promise<MaterializeResponse> {
  const canReuse = request.candidates.length > 0;
  const { value, attempts } = await runToolLoop<Resolved>(env, {
    system: materializeSystemPrompt(tools),
    // Candidates vary per request, so they go in the user message to keep the system prompt cacheable.
    prompt: materializeUserPrompt(request),
    toolCatalog: tools,
    tools: canReuse ? [REUSE_TOOL, EMIT_TOOL] : [EMIT_TOOL],
    handle: async (call) => {
      const outcome =
        call.name === REUSE_TOOL.name
          ? await handleReuse(call.input, request, tools, styles)
          : await handleEmit(call.input, request, tools, styles);
      return outcome.ok ? { ok: true, value: outcome } : outcome;
    },
  });
  return { ...value, attempts };
}
