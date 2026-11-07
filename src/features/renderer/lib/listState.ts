/** Reads a UI-state value as a list (anything else is treated as empty). */
export function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Returns `list` with `value` added or removed, keeping order and avoiding duplicates. */
export function toggleMember(list: unknown[], value: unknown, on: boolean): unknown[] {
  const without = list.filter((entry) => entry !== value);
  return on ? [...without, value] : without;
}
