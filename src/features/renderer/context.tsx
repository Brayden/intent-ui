import { createContext, useContext, type ReactNode } from "react";
import type { Action, Block, BlockView, RouteValues } from "../../../shared/spec";
import type { Scope } from "./lib/resolve";

/** Where an action came from, so handlers can target the right block and node. */
export type ActionOrigin = { blockId: string; nodeId: string; scope: Scope };
/** Handles an action. Rejects with a user-facing message when it fails (e.g. a tool error). */
export type ActionDispatcher = (action: Action, origin: ActionOrigin) => void | Promise<void>;

type BlockRuntime = { block: Block; view: BlockView };

const DispatchContext = createContext<ActionDispatcher | null>(null);
const RouteContext = createContext<RouteValues>({});

/** The current page's route values, readable in blocks at `/route/<name>` (ADR 0011/0013). */
export function RouteValuesProvider({ route, children }: { route: RouteValues; children: ReactNode }) {
  return <RouteContext.Provider value={route}>{children}</RouteContext.Provider>;
}

export function useRouteValues(): RouteValues {
  return useContext(RouteContext);
}
const BlockContext = createContext<BlockRuntime | null>(null);

export function DispatchProvider({ dispatch, children }: { dispatch: ActionDispatcher; children: ReactNode }) {
  return <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>;
}

export function BlockProvider({ runtime, children }: { runtime: BlockRuntime; children: ReactNode }) {
  return <BlockContext.Provider value={runtime}>{children}</BlockContext.Provider>;
}

/** The action dispatcher, or null outside `DispatchProvider` (e.g. a static preview). */
export function useOptionalDispatch(): ActionDispatcher | null {
  return useContext(DispatchContext);
}

/** Returns the action dispatcher. Must be rendered inside `DispatchProvider`. */
export function useDispatch(): ActionDispatcher {
  const dispatch = useContext(DispatchContext);
  if (!dispatch) throw new Error("useDispatch must be used inside DispatchProvider");
  return dispatch;
}

/** Returns the current block and its view. Must be rendered inside `BlockProvider`. */
export function useBlock(): BlockRuntime {
  const runtime = useContext(BlockContext);
  if (!runtime) throw new Error("useBlock must be used inside BlockProvider");
  return runtime;
}

/** Status of the inputs a field requires: the worst status wins; incomplete if any is. */
export function useInputStatus(requires: string[] = []) {
  const { view } = useBlock();
  const inputs = requires.map((alias) => view.inputs[alias]).filter((input) => input !== undefined);
  return {
    loading: inputs.some((input) => input.status === "loading"),
    failed: inputs.some((input) => input.status === "error" || input.status === "auth_required"),
    complete: inputs.every((input) => input.complete !== false),
  };
}
