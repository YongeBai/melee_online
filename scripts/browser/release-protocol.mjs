// Route hosted releases to the versioned depth-corrected loader. Keeping its
// URL distinct from the original immutable candidate avoids stale browser
// cache entries without modifying the pinned emulator source checkout.
export function correctReleaseCoreUrl(source) {
  const original = 'coreUrl: `./build/core-candidates/${requested}/dolphin-core-upstream.js`,';
  if (source.split(original).length !== 2) throw Error('Unknown candidate URL protocol');
  return source.replace(original,
    'coreUrl: `./build/core-candidates/${requested}/${new URLSearchParams(search).get("depthloader") === "2" ? "dolphin-core-upstream-depth-v2.js" : "dolphin-core-upstream.js"}`,');
}
