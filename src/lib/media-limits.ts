/**
 * Upload-Grenzen – gemeinsam für Browser (schnelles Feedback), Upload-Route
 * und Bildverarbeitung. Nur hier ändern.
 */
export const MEDIA_LIMITS = {
  logoBytes: 3 * 1024 * 1024,
  photoBytes: 15 * 1024 * 1024,
  panoramaBytes: 30 * 1024 * 1024,
  /** Obergrenze für den gesamten Request (größte Datei + Formularfelder) */
  requestBytes: 31 * 1024 * 1024,
  /** Schutz vor "Dekompressionsbomben" (z. B. 100 000 × 100 000 Pixel PNG) */
  maxInputPixels: 120_000_000,
} as const;

export const formatMb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;
