import type { ResearchDiff } from "../../shared/api";

type Row = Record<string, unknown>;

/** Compares rows by key: how many were added, removed, or changed. */
export function diffRows(before: Row[], after: Row[], key: string): ResearchDiff {
  const index = (rows: Row[]) => new Map(rows.map((row) => [String(row[key]), JSON.stringify(row)]));
  const old = index(before);
  const next = index(after);
  let added = 0;
  let changed = 0;
  for (const [id, json] of next) {
    if (!old.has(id)) added++;
    else if (old.get(id) !== json) changed++;
  }
  const removed = [...old.keys()].filter((id) => !next.has(id)).length;
  return { added, removed, changed, total: after.length };
}

/** Changes big enough that a person should confirm them rather than have them applied silently. */
export function diffWarnings(before: Row[], diff: ResearchDiff): string[] {
  const warnings: string[] = [];
  if (before.length > 0 && diff.total < before.length / 2) warnings.push(`Only ${diff.total} rows now, down from ${before.length}.`);
  if (before.length > 0 && diff.removed > before.length / 2) warnings.push(`${diff.removed} of ${before.length} previous rows are gone.`);
  return warnings;
}

/**
 * True if rows produced by a compiled recipe match the model's extraction closely enough to
 * replace it: ≥ 80% of keys in common, and ≥ 80% of shared fields equal on those rows.
 */
export function recipeMatches(extracted: Row[], compiled: Row[], key: string): boolean {
  if (extracted.length === 0 || compiled.length === 0) return false;
  const byKey = new Map(compiled.map((row) => [String(row[key]), row]));
  const common = extracted.filter((row) => byKey.has(String(row[key])));
  if (common.length < extracted.length * 0.8) return false;
  let fields = 0;
  let equal = 0;
  for (const row of common) {
    const other = byKey.get(String(row[key])) ?? {};
    for (const [field, value] of Object.entries(row)) {
      if (!(field in other)) continue;
      fields++;
      if (String(value).trim().toLowerCase() === String(other[field]).trim().toLowerCase()) equal++;
    }
  }
  return fields > 0 && equal >= fields * 0.8;
}
