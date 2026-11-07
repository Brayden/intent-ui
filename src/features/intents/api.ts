import type { MaterializeRequest, MaterializeResponse, ToolCallRequest, ToolCallResponse } from "../../../shared/api";
import { api } from "../../lib/api";

/** Asks the server to generate (or reuse) UI for a deferred intent. */
export const materializeIntent = (request: MaterializeRequest) => api<MaterializeResponse>("POST", "/api/intents/materialize", request);

/** Runs one tool on a connection. */
export const callTool = (request: ToolCallRequest) => api<ToolCallResponse>("POST", "/api/tools/call", request);
