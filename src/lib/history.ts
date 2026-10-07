export type Change = { index: number; before: number; after: number };
export class History {
  past: Change[][] = [];
  future: Change[][] = [];
  push(changes: Change[]) {
    if (!changes.length) return;
    this.past.push(changes);
    if (this.past.length > 80) this.past.shift();
    this.future = [];
  }
  clear() { this.past = []; this.future = []; }
}
