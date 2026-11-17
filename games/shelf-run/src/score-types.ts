// Shapes the score API sends back. Shared by the game, the stats page and api/.

export interface Ranks {
  all: number; // 1-based
  today: number;
  best: number; // this name's best all-time score
}

export type Board = Array<{ name: string; score: number }>;

export interface Stats {
  at: number;
  live: number; // runs started in the last 10 minutes that haven't ended
  totals: {
    runs: number;
    done: number;
    bots: number;
    shelves: number;
    meters: number;
    players: number;
    playersToday: number;
    runsToday: number;
    rejected: number;
  };
  days: Array<{ day: string; runs: number }>; // last 30 UTC days, oldest first
  hours: Array<{ hour: string; runs: number }>; // last 7 x 24 UTC hours, oldest first, like 2026-11-06T19
  hist: Array<{ from: number; runs: number }>; // ended runs by score
  board: { all: Board; today: Board };
  creators: Array<{ key: string; bots: number }>; // X handle or name -> bots of theirs published
  bots: Array<{ id: string; times: number }>;
  recent: Array<{ name: string | null; score: number; shelves: number; t: number; at: number }>;
}
