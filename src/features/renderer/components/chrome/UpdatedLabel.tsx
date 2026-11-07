import { Loader } from "@cloudflare/kumo/components/loader";
import { Text } from "@cloudflare/kumo/components/text";
import { formatValue } from "../../lib/format";

type UpdatedLabelProps = { updatedAt: string | null; loading: boolean; prefix?: string; size?: "xs" | "sm" };

/** "Updated 3 minutes ago", or a refreshing indicator while data reloads. Shared by frame and catalog. */
export function UpdatedLabel({ updatedAt, loading, prefix = "Updated ", size = "xs" }: UpdatedLabelProps) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Loader size={12} />
        <Text variant="secondary" size={size}>
          Refreshing…
        </Text>
      </span>
    );
  }
  if (!updatedAt) return null;
  return (
    <Text variant="secondary" size={size}>
      {prefix}
      {formatValue(updatedAt, "relative")}
    </Text>
  );
}
