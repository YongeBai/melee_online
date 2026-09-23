// Content-addressed chunks survive interrupted startup. Cache failures (private
// browsing, quota) must never prevent the game from loading.
export async function downloadGamePart(url, part, decode, {
  signal, cache, onBytes = () => {}, fetcher = fetch,
  idleMs = 30000, attempts = 3, retryMs = 500,
} = {}) {
  try {
    const saved = await cache?.match(url);
    if (saved) {
      const bytes = await decode(saved);
      onBytes(part.bytes);
      return {bytes, cached: true};
    }
  } catch { await cache?.delete(url).catch(() => {}); }
  for (let attempt = 0; attempt < attempts; attempt++) {
    signal?.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal?.addEventListener('abort', abort, {once: true});
    let timer;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(Error('Game download stalled. Please retry.')), idleMs);
    };
    let reader;
    try {
      onBytes(0);
      resetTimer();
      const response = await fetcher(url, {signal: controller.signal, cache: attempt ? 'reload' : 'default'});
      if (!response.ok) throw Error(`Game download failed (${response.status}). Please retry.`);
      reader = response.body.getReader();
      const chunks = [];
      let received = 0;
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > part.bytes) throw Error('Invalid game chunk length');
        chunks.push(value);
        resetTimer();
        onBytes(received);
      }
      clearTimeout(timer);
      const packed = new Blob(chunks);
      const bytes = await decode(new Response(packed));
      // Only persist chunks after both compressed and decoded hashes pass.
      try { await cache?.put(url, new Response(packed)); } catch {}
      return {bytes, cached: false};
    } catch (error) {
      await reader?.cancel().catch(() => {});
      signal?.throwIfAborted();
      if (attempt === attempts - 1) throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
    await new Promise(resolve => setTimeout(resolve, retryMs * (attempt + 1)));
  }
}
