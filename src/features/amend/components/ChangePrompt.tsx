import { Button } from "@cloudflare/kumo/components/button";
import { InputArea } from "@cloudflare/kumo/components/input";
import { Text } from "@cloudflare/kumo/components/text";
import { useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { ElementTarget } from "../../renderer";

const PANEL_WIDTH = 320;
const PANEL_HEIGHT = 200;
const PANEL = "fixed z-[1001] flex flex-col gap-3 rounded-lg border border-kumo-line bg-kumo-base p-3 shadow-lg";

type ChangePromptProps = {
  target: ElementTarget;
  pending: boolean;
  onSubmit: (prompt: string) => void;
  onClose: () => void;
};

/**
 * The "Change this…" box for a right-clicked element, at the click point. Portaled to <body>
 * above everything, open modals included, so it looks and behaves the same wherever you click.
 * Enter applies, Esc cancels.
 */
export function ChangePrompt({ target, pending, onSubmit, onClose }: ChangePromptProps) {
  const [prompt, setPrompt] = useState("");
  const send = () => prompt.trim() && !pending && onSubmit(prompt.trim());

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation(); // close the prompt, not the overlay around it
      onClose();
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  const position = {
    left: Math.max(16, Math.min(target.point.x, window.innerWidth - PANEL_WIDTH - 16)),
    top: Math.max(16, Math.min(target.point.y, window.innerHeight - PANEL_HEIGHT - 16)),
    width: PANEL_WIDTH,
  };

  const panel = (
    <div className={PANEL} style={position} role="group" aria-label="Change this element">
      <Text variant="secondary" size="xs">
        Change {target.label}
      </Text>
      <InputArea
        autoFocus
        aria-label="Describe the change"
        placeholder="Describe how this should change…"
        value={prompt}
        onValueChange={setPrompt}
        onKeyDown={onKeyDown}
        disabled={pending}
        autoResize
        minRows={2}
        maxRows={6}
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={send} loading={pending} disabled={!prompt.trim()}>
          Apply
        </Button>
      </div>
    </div>
  );

  return createPortal(
    <>
      <div className="fixed inset-0 z-[1000]" onClick={pending ? undefined : onClose} onContextMenu={(e) => e.preventDefault()} />
      {panel}
    </>,
    document.body,
  );
}
