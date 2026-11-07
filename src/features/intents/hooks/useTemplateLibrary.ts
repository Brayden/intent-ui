import { useCallback, useMemo, useRef } from "react";
import { resolveIntent, type Template } from "../../../../shared/api";
import { aliasKey, isTemplateCompatible } from "../../../../shared/spec";

const MAX_CANDIDATES = 12;

export type LibraryState = { templates: Template[]; aliases: Record<string, string> };

/** Saves a template (and, when given, the intent alias that resolves to it). */
export type PersistTemplate = (template: Template, aliasKey?: string) => void;

/**
 * Every template materialized in this workspace, plus which intents resolved to which template
 * (ADR 0003). Starts from the saved library and persists every change (ADR 0008).
 */
export function useTemplateLibrary(initial: LibraryState, persist: PersistTemplate) {
  const templates = useRef(new Map(initial.templates.map((template) => [template.id, template])));
  const aliases = useRef(new Map(Object.entries(initial.aliases)));

  /** A template this exact intent already resolved to, if it still fits the item (RFC 0003 §10.1). */
  const resolve = useCallback((intentId: string, prompt: string, item: unknown): Template | undefined => {
    const library = { templates: [...templates.current.values()], aliases: Object.fromEntries(aliases.current) };
    const resolution = resolveIntent(library, { id: intentId, prompt }, item);
    return resolution.via === "alias" ? resolution.template : undefined;
  }, []);

  /** Templates that could render for this item, newest first, for the model to consider. */
  const candidates = useCallback((item: unknown): Template[] => {
    return [...templates.current.values()]
      .reverse()
      .filter((template) => isTemplateCompatible(template, item))
      .slice(0, MAX_CANDIDATES);
  }, []);

  /** Records a template (new or reused) and that this intent resolves to it. */
  const remember = useCallback(
    (intentId: string, prompt: string, template: Template) => {
      const key = aliasKey(intentId, prompt);
      templates.current.set(template.id, template);
      aliases.current.set(key, template.id);
      persist(template, key);
    },
    [persist],
  );

  /** Replaces a template's content after an edit; aliases keep pointing at it. */
  const update = useCallback(
    (template: Template) => {
      templates.current.set(template.id, template);
      persist(template);
    },
    [persist],
  );

  return useMemo(() => ({ resolve, candidates, remember, update }), [resolve, candidates, remember, update]);
}
