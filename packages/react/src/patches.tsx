import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { HostData, HostPatch } from "../../../shared/api";
import { ID_ATTRIBUTE, PROTECTED_ATTRIBUTE } from "./attributes";
import { extractHostData } from "./hostData";
import { HostBlockView } from "./HostBlockView";
import { isProtected } from "./Protected";

/*
 * Customizations of the host's own UI, applied as a layer over it; the host's code is never
 * changed. Elements are addressed by the stable ids the Vite plugin adds.
 * - hide: CSS.
 * - insert: a container next to the target, with the generated block portaled into it.
 * - replace: the target hidden with CSS (it stays in the DOM and keeps feeding its data) and a
 *   container after it.
 * Everything re-applies as the host re-renders, and disappears when the master switch is off.
 */
export type Patch = HostPatch;

export type PatchStatus = {
  applied: string[];
  /** Target not on this page (maybe a host release changed it). Shown to the user, never guessed. */
  orphaned: string[];
  /** Target is in a protected area; refused. */
  refused: string[];
};

export const EMPTY_STATUS: PatchStatus = { applied: [], orphaned: [], refused: [] };

/** Marks containers of generated UI (and generated pages), which host right-click ignores. */
export const GENERATED_ATTRIBUTE = "data-iui-generated";
const PATCH_ATTRIBUTE = "data-iui-patch";
/** Set on the exact host elements a hide/replace applies to (ids can repeat across list items). */
const HIDE_ATTRIBUTE = "data-iui-hide";

/** The host elements carrying an id, outside generated UI, in page order. */
export function hostInstances(target: string): Element[] {
  return [...document.querySelectorAll(selector(target))].filter((el) => !el.closest(`[${GENERATED_ATTRIBUTE}]`));
}
const STYLE_ID = "intent-ui-patches";

const selector = (target: string) => `[${ID_ATTRIBUTE}="${CSS.escape(target)}"]`;

const subscribe = (onChange: () => void) => {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
};

type Mount = { patch: Extract<HostPatch, { block: unknown }>; container: HTMLElement; data: HostData };

/** Keeps `container` right where the patch wants it relative to `target`. */
function place(container: HTMLElement, target: Element, patch: Mount["patch"]): void {
  const before = patch.op === "insert" && patch.position === "before";
  const ok = before ? container.nextElementSibling === target : container.previousElementSibling === target;
  if (!ok) target.insertAdjacentElement(before ? "beforebegin" : "afterend", container);
}

export function PatchLayer({ patches, enabled, onStatus }: { patches: HostPatch[]; enabled: boolean; onStatus: (status: PatchStatus) => void }) {
  const pathname = useSyncExternalStore(subscribe, () => window.location.pathname);
  const [mounts, setMounts] = useState<Mount[]>([]);
  const containers = useRef(new Map<string, HTMLElement>());
  const lastStatus = useRef("");

  useEffect(() => {
    const style = document.getElementById(STYLE_ID) ?? Object.assign(document.createElement("style"), { id: STYLE_ID });
    if (!style.isConnected) document.head.append(style);
    const owned = containers.current;

    const clear = () => {
      style.textContent = "";
      for (const el of document.querySelectorAll(`[${HIDE_ATTRIBUTE}]`)) el.removeAttribute(HIDE_ATTRIBUTE);
      for (const container of owned.values()) container.remove();
      owned.clear();
      setMounts((current) => (current.length === 0 ? current : []));
    };

    const apply = () => {
      if (!enabled) {
        clear();
        report(EMPTY_STATUS);
        return;
      }
      // Only this page's patches; others aren't orphaned, just elsewhere. Read live: routers like
      // React Router use pushState without a popstate event, but their re-render triggers this.
      const page = window.location.pathname;
      const here = patches.filter((patch) => patch.page === undefined || patch.page === page);
      const status: PatchStatus = { applied: [], orphaned: [], refused: [] };
      const hidden = new Set<Element>();
      const next: Mount[] = [];

      for (const patch of here) {
        const target = hostInstances(patch.target)[patch.index ?? 0];
        if (!target) {
          status.orphaned.push(patch.id);
          continue;
        }
        // Inside a protected area, or (for hide/replace) around one: refused, never applied.
        if (isProtected(target) || (patch.op !== "insert" && target.querySelector(`[${PROTECTED_ATTRIBUTE}]`))) {
          status.refused.push(patch.id);
          continue;
        }
        status.applied.push(patch.id);
        if (patch.op === "hide" || patch.op === "replace") hidden.add(target);
        if (patch.op === "hide") continue;
        let container = owned.get(patch.id);
        if (!container) {
          container = document.createElement("div");
          container.setAttribute(GENERATED_ATTRIBUTE, "");
          container.setAttribute(PATCH_ATTRIBUTE, patch.id);
          owned.set(patch.id, container);
        }
        place(container, target, patch);
        next.push({ patch, container, data: extractHostData(target) });
      }

      // Containers whose patches are gone or elsewhere.
      for (const [id, container] of owned) {
        if (!next.some((mount) => mount.patch.id === id)) {
          container.remove();
          owned.delete(id);
        }
      }
      // Hide exactly these instances (attribute changes don't trigger the observer: it watches nodes).
      for (const el of document.querySelectorAll(`[${HIDE_ATTRIBUTE}]`)) if (!hidden.has(el)) el.removeAttribute(HIDE_ATTRIBUTE);
      for (const el of hidden) if (!el.hasAttribute(HIDE_ATTRIBUTE)) el.setAttribute(HIDE_ATTRIBUTE, "");
      style.textContent = `[${HIDE_ATTRIBUTE}]{display:none!important}`;
      setMounts((current) =>
        current.length === next.length &&
        current.every((m, i) => m.patch === next[i]!.patch && m.container === next[i]!.container && JSON.stringify(m.data) === JSON.stringify(next[i]!.data))
          ? current
          : next,
      );
      report(status);
    };

    const report = (status: PatchStatus) => {
      const key = JSON.stringify(status);
      if (key === lastStatus.current) return;
      lastStatus.current = key;
      onStatus(status);
    };

    apply();
    let frame = 0;
    const observer = new MutationObserver((records) => {
      // Our own containers' contents changing doesn't need a re-check.
      if (records.every((record) => record.target instanceof Element && record.target.closest(`[${PATCH_ATTRIBUTE}]`))) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      clear();
    };
  }, [patches, enabled, pathname, onStatus]);

  return (
    <>
      {mounts.map((mount) => createPortal(<HostBlockView patchId={mount.patch.id} block={mount.patch.block} data={mount.data} />, mount.container, mount.patch.id))}
    </>
  );
}
