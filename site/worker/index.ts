/**
 * Serves the site's static assets, adding HTTP Range support for media. Workers static assets
 * always answer with the whole file, and browsers need `206 Partial Content` responses to seek
 * in a video, so requests for media (routed here by `run_worker_first`) are sliced here.
 */
export interface Env {
  ASSETS: Fetcher;
}

/** Parses a single `bytes=` range against a file size. Null means unsatisfiable; undefined, no usable range. */
function parseRange(header: string, size: number): { start: number; end: number } | null | undefined {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return undefined; // multiple ranges or another unit: serve the whole file
  const [, from = "", to = ""] = match;
  if (from === "" && to === "") return undefined;
  let start: number;
  let end: number;
  if (from === "") {
    // Suffix range: the last N bytes.
    const length = Number(to);
    if (length === 0) return null;
    start = Math.max(0, size - length);
    end = size - 1;
  } else {
    start = Number(from);
    end = to === "" ? size - 1 : Math.min(Number(to), size - 1);
  }
  if (start >= size || start > end) return null;
  return { start, end };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const range = request.headers.get("Range");
    // Fetch the whole asset without the Range header, keeping conditional headers.
    const headers = new Headers(request.headers);
    headers.delete("Range");
    const asset = await env.ASSETS.fetch(new Request(request.url, { method: request.method, headers }));
    if (asset.status !== 200) return asset;

    const responseHeaders = new Headers(asset.headers);
    responseHeaders.set("Accept-Ranges", "bytes");
    if (!range) return new Response(asset.body, { status: 200, headers: responseHeaders });

    const body = await asset.arrayBuffer();
    const parsed = parseRange(range, body.byteLength);
    if (parsed === undefined) return new Response(body, { status: 200, headers: responseHeaders });
    if (parsed === null) {
      responseHeaders.set("Content-Range", `bytes */${body.byteLength}`);
      responseHeaders.delete("Content-Length");
      return new Response(null, { status: 416, headers: responseHeaders });
    }

    const { start, end } = parsed;
    responseHeaders.set("Content-Range", `bytes ${start}-${end}/${body.byteLength}`);
    responseHeaders.set("Content-Length", String(end - start + 1));
    return new Response(request.method === "HEAD" ? null : body.slice(start, end + 1), { status: 206, headers: responseHeaders });
  },
} satisfies ExportedHandler<Env>;
