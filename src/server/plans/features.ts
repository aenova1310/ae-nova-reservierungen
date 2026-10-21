/**
 * Feature-Matrix der Tarife. Bewusst im Code (nicht in der DB), damit
 * Feature-Gates typsicher sind und nicht durch Datenänderungen geöffnet werden.
 * Preise liegen in der Tabelle `plans` und sind im Super-Admin editierbar.
 */
export type PlanCode = "BASIC" | "PRO";

export const PLAN_FEATURES = {
  BASIC: {
    floorplanEditor: false,
    tableView: false,
    deposits: false,
    statistics: false,
    removePoweredBy: false,
    maxMembers: 1,
  },
  PRO: {
    floorplanEditor: true,
    tableView: true,
    deposits: true,
    statistics: true,
    removePoweredBy: true,
    maxMembers: Number.POSITIVE_INFINITY,
  },
} as const satisfies Record<PlanCode, Record<string, boolean | number>>;

export type BooleanFeature = {
  [K in keyof (typeof PLAN_FEATURES)["PRO"]]: (typeof PLAN_FEATURES)["PRO"][K] extends boolean ? K : never;
}[keyof (typeof PLAN_FEATURES)["PRO"]];

export function hasFeature(plan: PlanCode, feature: BooleanFeature): boolean {
  return PLAN_FEATURES[plan][feature] as boolean;
}

export function maxMembers(plan: PlanCode): number {
  return PLAN_FEATURES[plan].maxMembers;
}

export class FeatureNotInPlanError extends Error {
  readonly code = "FEATURE_NOT_IN_PLAN";
  constructor(readonly feature: string) {
    super(`Diese Funktion ist im aktuellen Tarif nicht enthalten (${feature}).`);
  }
}

/** Serverseitiges Gate – am Anfang jeder betroffenen Action/Route aufrufen. */
export function requireFeature(restaurant: { planCode: PlanCode }, feature: BooleanFeature): void {
  if (!hasFeature(restaurant.planCode, feature)) throw new FeatureNotInPlanError(feature);
}
