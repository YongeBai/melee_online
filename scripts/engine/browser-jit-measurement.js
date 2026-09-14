// QA boundary counters, with profiling disabled. These totals measure synchronous
// JIT work only; browser background optimization/tiering is not included.
export function parseJitCounters(details) {
  const patterns = {
    moduleUs: /modcompile:(\d+)us\/max/,
    instanceUs: /modinst:(\d+)us\/max/,
    uniqueInstances: /unique-instances:(\d+)\/65536/,
    reusedInstances: /reused-instances:(\d+)/,
  };
  const result = {};
  for (const [name, pattern] of Object.entries(patterns)) {
    const match = pattern.exec(details || '');
    if (!match || !Number.isSafeInteger(Number(match[1])))
      throw Error('Missing JIT boundary counter: ' + name);
    result[name] = Number(match[1]);
  }
  return result;
}

export async function measureWithJitCounters(host, measure) {
  const read = async () => parseJitCounters(
    (await host.adapter.request('rendererDiagnostics', {})).cpuDetails);
  const before = await read();
  const result = await measure();
  const after = await read();
  const delta = {};
  for (const key of Object.keys(before)) {
    delta[key] = after[key] - before[key];
    if (delta[key] < 0) throw Error('JIT counter reset or wrapped: ' + key);
  }
  return {...result, jitWork: {before, after, delta,
    synchronousCompileAndLinkMs: (delta.moduleUs + delta.instanceUs) / 1000,
    scope: 'Diagnostics bracket image measurement and include small boundary overhead. No per-frame profiling. Excludes browser background optimization/tiering.'}};
}
