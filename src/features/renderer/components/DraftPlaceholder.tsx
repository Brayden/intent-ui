/** Stands in for a node of a page that's still being written (ADR 0017): a block-sized one for a block's body. */
export function DraftPlaceholder({ id, block = false }: { id: string; block?: boolean }) {
  return block ? (
    <div aria-hidden data-draft-placeholder={id} className="h-24 w-full animate-pulse rounded-md bg-kumo-tint" />
  ) : (
    <span aria-hidden data-draft-placeholder={id} className="inline-block h-4 w-24 max-w-full animate-pulse rounded bg-kumo-tint align-middle" />
  );
}
