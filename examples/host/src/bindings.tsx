import { defineBindings, formatValue } from "../../../packages/react/src";
import { StatusPill } from "./components/StatusPill";

/**
 * Acme's components for catalog types. Generated UI uses these instead of the built-in Kumo ones;
 * everything not listed keeps the default. Each binding gets the type's validated props.
 */
export const bindings = defineBindings({
  Badge: ({ props }) => (
    <StatusPill tone={props.variant === "outline" ? "neutral" : props.variant}>{formatValue(props.text)}</StatusPill>
  ),
});
