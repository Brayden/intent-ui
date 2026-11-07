import { Text } from "@cloudflare/kumo/components/text";

/** Inline marker for a node that can't render. Invalid specs should be caught server-side. */
export function NodeError({ id, message }: { id: string; message: string }) {
  return (
    <span className="rounded border border-kumo-line px-1" title={`Node "${id}"`}>
      <Text variant="error" size="xs">
        {message}
      </Text>
    </span>
  );
}
