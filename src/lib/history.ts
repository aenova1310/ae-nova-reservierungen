/**
 * Rückgängig/Wiederholen für Editoren (rein, ohne React).
 *
 * - `commit`: neuer Zustand als eigener Schritt.
 * - `preview`: Zwischenstand während eines Ziehvorgangs, ohne Verlaufseintrag.
 * - `settle`: beendet einen Ziehvorgang; der Zustand vor dem Ziehen wird zu
 *   EINEM Verlaufsschritt (sofern sich etwas geändert hat).
 */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export type HistoryAction<T> =
  | { type: "commit"; update: (present: T) => T }
  | { type: "preview"; update: (present: T) => T }
  | { type: "settle"; from: T }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; present: T };

export const HISTORY_LIMIT = 100;

export const initHistory = <T>(present: T): History<T> => ({ past: [], present, future: [] });

const push = <T>(past: T[], item: T) => [...past, item].slice(-HISTORY_LIMIT);

export function historyReducer<T>(state: History<T>, action: HistoryAction<T>): History<T> {
  switch (action.type) {
    case "commit": {
      const next = action.update(state.present);
      if (next === state.present) return state;
      return { past: push(state.past, state.present), present: next, future: [] };
    }
    case "preview": {
      const next = action.update(state.present);
      return next === state.present ? state : { ...state, present: next };
    }
    case "settle":
      if (action.from === state.present) return state;
      return { past: push(state.past, action.from), present: state.present, future: [] };
    case "undo": {
      if (state.past.length === 0) return state;
      return { past: state.past.slice(0, -1), present: state.past[state.past.length - 1], future: [state.present, ...state.future] };
    }
    case "redo": {
      if (state.future.length === 0) return state;
      return { past: push(state.past, state.present), present: state.future[0], future: state.future.slice(1) };
    }
    case "reset":
      return initHistory(action.present);
  }
}
