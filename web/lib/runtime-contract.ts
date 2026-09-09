/**
 * Target browser-port ABI, not an implemented game engine.
 * No adapter is shipped because no compatible Melee WASM runtime exists here.
 */
import type { createMatch } from './roster';
import type { Pad } from './input';
export type MeleeMatch = ReturnType<typeof createMatch>;
export interface MeleeRuntime {
  // Resolves only after the original match scene and its assets are ready.
  startMatch(match: MeleeMatch): Promise<void>;
  setPad(port: 0, pad: Readonly<Pad>): void;
  setPaused(paused: boolean): void;
  dispose(): Promise<void>;
}
export interface MeleeRuntimeHost {
  canvas: HTMLCanvasElement;
  // Read a game archive by path; a future source port need not require an ISO.
  readGameFile(
    path: string,
    offset: number,
    length: number,
  ): Promise<ArrayBuffer>;
  // Called after the game's actual final result (including tie resolution).
  // The frontend must dispose the match and return to character select.
  onMatchEnd(result: {
    winnerPort: 0 | 1 | null;
    reason: 'stocks' | 'timeout' | 'quit';
  }): void;
  onError(error: Error): void;
}
export interface MeleeRuntimeModule {
  abiVersion: 1;
  createRuntime(host: MeleeRuntimeHost): Promise<MeleeRuntime>;
}
