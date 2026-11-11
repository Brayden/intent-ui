import { Button } from "@cloudflare/kumo/components/button";
import { InputArea } from "@cloudflare/kumo/components/input";
import { Text } from "@cloudflare/kumo/components/text";
import { ArrowsOutSimple } from "@phosphor-icons/react";
import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { HostEditResponse, HostPatch } from "../../../shared/api";
import { api } from "../../../src/lib/api";
import { useToasts } from "../../../src/lib/useToasts";
import { ID_ATTRIBUTE, PROTECTED_ATTRIBUTE } from "./attributes";
import { describeHostElement, hostElementLabel } from "./hostData";
import { GENERATED_ATTRIBUTE, hostInstances } from "./patches";

const PANEL_WIDTH = 340;

type Selection = {
  element: Element;
  id: string;
  point: { x: number; y: number };
  /** Set when the user right-clicked a customization (its generated UI) to revise it. */
  current?: HostPatch;
};

type Found = { element: Element } | { protectedReason: string } | null;

/**
 * The nearest tagged host element at or above `from`, outside generated UI. Hitting a protected
 * area first means the click was inside it: never select something around it instead.
 */
function taggedAncestor(from: Element | null): Found {
  for (let el = from; el; el = el.parentElement) {
    if (el.hasAttribute(GENERATED_ATTRIBUTE)) return null;
    if (el.hasAttribute(PROTECTED_ATTRIBUTE)) return { protectedReason: el.getAttribute(PROTECTED_ATTRIBUTE) ?? "" };
    if (el.hasAttribute(ID_ATTRIBUTE)) return { element: el };
  }
  return null;
}

/** Elements that contain a protected area can't be selected: hiding or replacing them would change it. */
const containsProtected = (element: Element) => element.querySelector(`[${PROTECTED_ATTRIBUTE}]`) !== null;

/**
 * Right-click anything on the host's pages to change it. The nearest tagged element is selected
 * (and outlined); "Select larger area" walks up to its tagged parent. Protected areas explain why
 * they can't be changed. Right-clicking a customization's generated UI revises that customization.
 * Generated pages handle their own right-click (pointed edits). Shift+right-click keeps the
 * browser's menu.
 */
export function HostEditing({ enabled, patches, onPatch, onRemove }: { enabled: boolean; patches: HostPatch[]; onPatch: (patch: HostPatch, css: string) => void; onRemove: (id: string) => void }) {
  const toasts = useToasts();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [prompt, setPrompt] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setSelection(null);
      return;
    }
    const onContextMenu = (event: MouseEvent) => {
      if (event.shiftKey || !(event.target instanceof Element)) return;
      const target = event.target;
      // Generated pages have their own right-click editing.
      if (target.closest("[data-iui-region='generated-page']")) return;
      const patchContainer = target.closest(`[${GENERATED_ATTRIBUTE}][data-iui-patch]`);
      if (patchContainer) {
        const current = patches.find((patch) => patch.id === patchContainer.getAttribute("data-iui-patch"));
        const element = current && hostInstances(current.target)[current.index ?? 0];
        if (!current || !element) return;
        event.preventDefault();
        setSelection({ element, id: current.target, point: { x: event.clientX, y: event.clientY }, current });
        setPrompt("");
        return;
      }
      const found = taggedAncestor(target);
      if (!found) return;
      event.preventDefault();
      if ("protectedReason" in found || containsProtected(found.element)) {
        const reason = "protectedReason" in found ? found.protectedReason : "";
        toasts.add({ title: "This area can't be customized", description: reason || "The site marked it as protected." });
        return;
      }
      const { element } = found;
      setSelection({ element, id: element.getAttribute(ID_ATTRIBUTE)!, point: { x: event.clientX, y: event.clientY } });
      setPrompt("");
    };
    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, [enabled, patches, toasts]);

  const widen = useCallback(() => {
    setSelection((current) => {
      if (!current || current.current) return current;
      const found = taggedAncestor(current.element.parentElement);
      if (!found || !("element" in found) || containsProtected(found.element)) return current;
      return { ...current, element: found.element, id: found.element.getAttribute(ID_ATTRIBUTE)! };
    });
  }, []);

  const submit = async () => {
    if (!selection || !prompt.trim() || pending) return;
    setPending(true);
    try {
      const result = await api<HostEditResponse>("POST", "/api/host/edit", {
        page: selection.current?.page ?? window.location.pathname,
        element: describeHostElement(selection.element, selection.id),
        index: Math.max(0, hostInstances(selection.id).indexOf(selection.element)),
        prompt: prompt.trim(),
        current: selection.current,
      });
      if (result.status === "declined") {
        toasts.add({ title: "Couldn't make that change", description: result.reason, variant: "error" });
      } else {
        onPatch(result.patch, result.css);
        toasts.add({ title: "Updated", description: result.summary });
        setSelection(null);
      }
    } catch (error) {
      toasts.add({ title: "Couldn't make that change", description: (error as Error).message, variant: "error" });
    } finally {
      setPending(false);
    }
  };

  if (!selection) return null;
  const rect = selection.element.getBoundingClientRect();
  const left = Math.max(16, Math.min(selection.point.x, window.innerWidth - PANEL_WIDTH - 16));
  const top = Math.max(16, Math.min(selection.point.y, window.innerHeight - 240));
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") setSelection(null);
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  return createPortal(
    <>
      {/* The selected element, outlined. */}
      <div
        aria-hidden
        className="pointer-events-none fixed z-[1000] rounded-md outline-2 outline-offset-2 outline-kumo-brand"
        style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      />
      <div className="fixed inset-0 z-[1000]" onClick={() => setSelection(null)} onContextMenu={(event) => event.preventDefault()} />
      <div
        role="dialog"
        aria-label="Change this"
        className="fixed z-[1001] flex flex-col gap-3 rounded-lg border border-kumo-line bg-kumo-base p-3 shadow-lg"
        style={{ left, top, width: PANEL_WIDTH }}
      >
        <div className="flex items-center justify-between gap-2">
          <Text variant="secondary" size="sm">
            {selection.current ? "Change this customization" : `Change ${hostElementLabel(selection.element)}`}
          </Text>
          {!selection.current && (
            <Button size="xs" variant="ghost" icon={ArrowsOutSimple} onClick={widen} title="Select the larger area around it">
              Larger area
            </Button>
          )}
        </div>
        <InputArea
          autoFocus
          rows={2}
          value={prompt}
          onValueChange={setPrompt}
          onKeyDown={onKeyDown}
          placeholder={selection.current ? "How should it change?" : "Hide it, add something next to it, or show it differently…"}
          aria-label="Describe the change"
        />
        <div className="flex items-center justify-between gap-2">
          {selection.current ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onRemove(selection.current!.id);
                setSelection(null);
              }}
            >
              Remove customization
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setSelection(null)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" loading={pending} disabled={!prompt.trim()} onClick={() => void submit()}>
              Apply
            </Button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
