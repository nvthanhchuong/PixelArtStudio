export type Change = { index: number; before: number; after: number };
export const HISTORY_LIMIT = 80;
export const HISTORY_PIXEL_BUDGET = 262144;
export class History {
  past: Change[][] = [];
  future: Change[][] = [];
  push(changes: Change[]) {
    if (!changes.length) return;
    this.past.push(changes);
    this.future = [];
    let pixels = this.past.reduce((total, action) => total + action.length, 0);
    while (this.past.length > 1 && (this.past.length > HISTORY_LIMIT || pixels > HISTORY_PIXEL_BUDGET)) {
      pixels -= this.past.shift()!.length;
    }
  }
  clear() { this.past = []; this.future = []; }
}
