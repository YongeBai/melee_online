// Current Dolphin source has no execution consumer of m_idled_cycles or
// GetIdleTicks(). Keep raw equality separate: this classifies only a complete
// snapshot diff confined to that one historical accounting field. Event
// ordinals, actual clocks, idle-loop control and every other byte stay strict.
export function differsOnlyInUnusedIdleAccounting(comparison) {
  if (!comparison || !Number.isSafeInteger(comparison.sizeA) || comparison.sizeA <= 0 ||
      comparison.sizeA !== comparison.sizeB || !Array.isArray(comparison.sections) ||
      comparison.sections.length !== 29) return false;
  let end = 0, changed = 0;
  const names = new Set();
  for (const section of comparison.sections) {
    if (names.has(section.name) || section.startA !== end || section.startB !== end ||
        !Number.isSafeInteger(section.bytesA) || section.bytesA < 0 ||
        section.bytesA !== section.bytesB || section.unmatchedBytes !== 0 ||
        !Number.isSafeInteger(section.differentBytes) || section.differentBytes < 0 ||
        !Array.isArray(section.ranges) || section.rangesTruncated ||
        section.rangeCount !== section.ranges.length) return false;
    names.add(section.name); end += section.bytesA;
    if (section.differentBytes === 0) {
      if (section.ranges.length) return false;
      continue;
    }
    if (section.name !== 'CoreTiming' || !section.fieldsComplete || section.differentBytes > 8)
      return false;
    let accounted = 0, rangeEnd = 12;
    for (const range of section.ranges) {
      if (!Number.isSafeInteger(range.offset) || !Number.isSafeInteger(range.bytes) ||
          range.bytes <= 0 || range.offset < rangeEnd || range.offset + range.bytes > 20)
        return false;
      for (const field of [range.fieldA, range.fieldB])
        if (field?.name !== 'CoreTiming.m_idled_cycles' || field.startRelativeOffset !== 12 ||
            field.bytes !== 8 || field.containsWholeRange !== true) return false;
      rangeEnd = range.offset + range.bytes;
      accounted += range.bytes;
    }
    if (accounted !== section.differentBytes) return false;
    changed += accounted;
  }
  return end === comparison.sizeA && changed > 0;
}
