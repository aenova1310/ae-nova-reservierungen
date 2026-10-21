import { isValidMediaKey, mediaStorage } from "@/server/media/storage";

/**
 * GET /media/<key> – liefert Logos und Tischbilder über die eigene Domain aus.
 * Schlüssel enthalten einen Inhalts-Hash → unveränderlich und lange cachebar.
 */
export async function GET(_request: Request, ctx: RouteContext<"/media/[...key]">) {
  const { key: parts } = await ctx.params;
  const key = parts.join("/");
  if (!isValidMediaKey(key)) return new Response("Not found", { status: 404 });
  const object = await mediaStorage().get(key);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(object.body), {
    headers: {
      "Content-Type": object.contentType,
      "Content-Length": String(object.body.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      // Nur von unseren eigenen Seiten (Widget, Admin) einbindbar
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
