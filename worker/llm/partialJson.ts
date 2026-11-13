/**
 * Parses the prefix of a JSON document that's still streaming (a tool call's input as the model
 * writes it). Only complete values appear: an unfinished string, number, literal or key is left
 * out, so an id or class name is never half-written. Objects and arrays appear as soon as they
 * open; the ones whose closing bracket has arrived are in `closed`, so callers can tell a
 * finished node from one still being written.
 */
export type PartialJson = { value: unknown; closed: WeakSet<object> };

export function parsePartialJson(text: string): PartialJson {
  const closed = new WeakSet<object>();
  let i = 0;
  const n = text.length;
  /** Thrown when the text ends inside a value; the value is then dropped. */
  const END = Symbol("end");

  const ws = () => {
    while (i < n && (text[i] === " " || text[i] === "\n" || text[i] === "\r" || text[i] === "\t")) i++;
  };

  const string = (): string => {
    // text[i] === '"'
    let j = i + 1;
    let escaped = false;
    for (; j < n; j++) {
      const c = text[j];
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') break;
    }
    if (j >= n) throw END;
    const raw = text.slice(i, j + 1);
    i = j + 1;
    return JSON.parse(raw) as string;
  };

  const number = (): number => {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i, i + 64));
    if (!match) throw new SyntaxError(`Unexpected "${text[i]}" at ${i}`);
    // A number at the very end may still be growing (12 → 123).
    if (i + match[0].length >= n) throw END;
    i += match[0].length;
    return Number(match[0]);
  };

  const literal = (): boolean | null => {
    for (const [word, value] of [["true", true], ["false", false], ["null", null]] as const) {
      if (text.startsWith(word, i)) {
        i += word.length;
        return value;
      }
      if (word.startsWith(text.slice(i, i + word.length)) && i + word.length > n) throw END;
    }
    throw new SyntaxError(`Unexpected "${text[i]}" at ${i}`);
  };

  const value = (): unknown => {
    ws();
    if (i >= n) throw END;
    const c = text[i];
    if (c === "{") return object();
    if (c === "[") return array();
    if (c === '"') return string();
    if (c === "-" || (c! >= "0" && c! <= "9")) return number();
    return literal();
  };

  // Containers are returned even when the text ends inside them: what's complete so far.
  let partial: unknown;
  const object = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    i++; // {
    try {
      ws();
      if (text[i] === "}") {
        i++;
        closed.add(out);
        return out;
      }
      for (;;) {
        ws();
        if (text[i] !== '"') {
          if (i >= n) throw END;
          throw new SyntaxError(`Expected a key at ${i}`);
        }
        const key = string();
        ws();
        if (i >= n) throw END;
        if (text[i] !== ":") throw new SyntaxError(`Expected ":" at ${i}`);
        i++;
        try {
          out[key] = value();
        } catch (error) {
          if (error === END && partial !== undefined) out[key] = partial;
          partial = undefined;
          throw error;
        }
        ws();
        if (i >= n) throw END;
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] === "}") {
          i++;
          closed.add(out);
          return out;
        }
        throw new SyntaxError(`Expected "," or "}" at ${i}`);
      }
    } catch (error) {
      if (error === END) partial = out;
      throw error;
    }
  };

  const array = (): unknown[] => {
    const out: unknown[] = [];
    i++; // [
    try {
      ws();
      if (text[i] === "]") {
        i++;
        closed.add(out);
        return out;
      }
      for (;;) {
        try {
          out.push(value());
        } catch (error) {
          if (error === END && partial !== undefined) out.push(partial);
          partial = undefined;
          throw error;
        }
        ws();
        if (i >= n) throw END;
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] === "]") {
          i++;
          closed.add(out);
          return out;
        }
        throw new SyntaxError(`Expected "," or "]" at ${i}`);
      }
    } catch (error) {
      if (error === END) partial = out;
      throw error;
    }
  };

  try {
    return { value: value(), closed };
  } catch (error) {
    if (error === END) return { value: partial, closed };
    throw error;
  }
}
