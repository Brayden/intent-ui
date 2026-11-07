import type { AmendRequest, AmendResponse } from "../../../shared/api";
import { api } from "../../lib/api";

/** Asks the server to turn a pointed prompt into ops on one tree. */
export const amendElement = (request: AmendRequest) => api<AmendResponse>("POST", "/api/intents/amend", request);
