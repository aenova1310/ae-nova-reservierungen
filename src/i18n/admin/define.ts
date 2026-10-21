/**
 * Wörterbuch eines Admin-Bereichs. Deutsch ist die Quelle; Englisch muss
 * GENAU dieselben Schlüssel haben – fehlende oder überzählige Schlüssel sind
 * ein Typfehler (der Build schlägt fehl, statt dass Text fehlt).
 *
 * Platzhalter: {name}. Pluralformen: "Singular|Plural" mit der Variable `count`.
 */
export function defineMessages<const D extends Record<string, string>>(de: D, en: { [K in keyof D]: string }) {
  return { de, en };
}
