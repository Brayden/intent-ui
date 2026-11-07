/** Returns a copy of `target` with the value at a JSON Pointer path set (objects created as needed). */
export function setByPointer(target: Record<string, unknown>, pointer: string, value: unknown): Record<string, unknown> {
  const [head, ...rest] = pointer
    .split("/")
    .slice(1)
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
  if (head === undefined || head === "") return target;
  if (rest.length === 0) return { ...target, [head]: value };
  const child = target[head];
  const next = child !== null && typeof child === "object" && !Array.isArray(child) ? (child as Record<string, unknown>) : {};
  return { ...target, [head]: setByPointer(next, `/${rest.join("/")}`, value) };
}
