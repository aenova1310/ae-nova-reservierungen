/** Reservierte Slugs, die mit Routen oder Systembegriffen kollidieren würden. */
const RESERVED_SLUGS = new Set(["admin", "api", "embed", "r", "superadmin", "login", "passwort-vergessen", "passwort-neu", "einladung", "app", "www", "static", "_next"]);

/**
 * "Osteria Lumière & Söhne" → "osteria-lumiere-soehne".
 * Deutsche Umlaute werden ausgeschrieben, andere Akzente entfernt.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // kombinierende Akzentzeichen entfernen
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug) && !RESERVED_SLUGS.has(slug) && !slug.includes("--");
}
