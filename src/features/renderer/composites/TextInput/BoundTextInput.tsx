import { Input } from "@cloudflare/kumo/components/input";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { TextInputProps } from "../../../../../shared/catalog";
import type { CatalogComponentProps } from "../../catalog/types";
import { useBlock, useDispatch } from "../../context";
import { resolvePath } from "../../lib/resolve";

const LIVE_DELAY_MS = 350;

/**
 * A Kumo input bound to `bind` (ADR 0013). /ui/ binds save as you type. /route/ binds change the
 * page URL (and so what data loads): on Enter, or as you type with `live`. Enter then fires the
 * node's action.
 */
export function BoundTextInput({ nodeId, node, props, scope }: CatalogComponentProps<TextInputProps>) {
  const { block } = useBlock();
  const dispatch = useDispatch();
  const bound = resolvePath(props.bind, scope);
  const committed = bound === undefined || bound === null ? "" : String(bound);
  const [draft, setDraft] = useState(committed);
  const isRoute = props.bind.startsWith("/route/");
  const origin = { blockId: block.id, nodeId, scope };

  // Follow outside changes (back/forward, another control writing the same value).
  useEffect(() => setDraft(committed), [committed]);

  const write = (value: string, replace: boolean) =>
    dispatch({ name: "set", params: { path: props.bind, value, replace } }, origin);

  // Live route binds: update the URL after a pause. A burst of typing adds one history entry and
  // then updates it, so Back returns to the previous search rather than each keystroke.
  const latestWrite = useRef(write);
  latestWrite.current = write;
  const typing = useRef(false);
  useEffect(() => {
    if (!isRoute || !props.live || draft === committed) return;
    const timer = setTimeout(() => {
      void latestWrite.current(draft, typing.current);
      typing.current = true;
    }, LIVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, committed, isRoute, props.live]);

  const onChange = (value: string) => {
    setDraft(value);
    if (!isRoute) void write(value, true);
  };

  const onKeyDown = async (event: KeyboardEvent) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    typing.current = false;
    if (isRoute && draft !== committed) await write(draft, false);
    if (node.action) await dispatch(node.action, origin);
  };

  return (
    <Input
      label={props.label}
      aria-label={props.label ? undefined : props.placeholder}
      placeholder={props.placeholder}
      type={props.type}
      value={draft}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => void onKeyDown(event)}
      onBlur={() => (typing.current = false)}
    />
  );
}
