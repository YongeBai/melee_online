'use client';
import { useEffect } from 'react';
import { flushSync } from 'react-dom';
import { character, createMatch } from './roster';
type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};
type ToolDocument = Document & {
  modelContext?: {
    registerTool: (
      tool: Tool,
      options: { signal: AbortSignal },
    ) => void | Promise<void>;
  };
};
export function useRosterTool(
  configure: (player: number, cpu: number) => void,
  tapJump = true,
) {
  useEffect(() => {
    const context = (document as ToolDocument).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tool: Tool = {
      name: 'configure_melee_match',
      title: 'Choose Melee fighters',
      description:
        'Set the human and level-9 CPU characters and show character select. This stages a match; combat is unavailable in this development build.',
      inputSchema: {
        type: 'object',
        properties: {
          player: { type: 'integer', minimum: 0, maximum: 25 },
          cpu: { type: 'integer', minimum: 0, maximum: 25 },
        },
        required: ['player', 'cpu'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input: unknown) {
        if (!input || typeof input !== 'object')
          throw new Error('Supply player and cpu CharacterKind IDs.');
        const value = input as Record<string, unknown>;
        if (
          Object.keys(value).length !== 2 ||
          !Number.isInteger(value.player) ||
          !Number.isInteger(value.cpu)
        )
          throw new Error('Supply only integer player and cpu IDs.');
        const player = Number(value.player),
          cpu = Number(value.cpu);
        character(player);
        character(cpu);
        flushSync(() => configure(player, cpu));
        return {
          status: 'configured',
          playable: false,
          match: createMatch(player, cpu, { tapJump }),
        };
      },
    };
    try {
      void Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {
      /* Optional API; normal controls remain available. */
    }
    return () => lifecycle.abort();
  }, [configure, tapJump]);
}
