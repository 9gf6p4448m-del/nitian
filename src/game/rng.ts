export function seedHash(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return h >>> 0
}

export function shuffle<T>(input: readonly T[], rng: number): { items: T[]; rng: number } {
  const items = [...input]
  for (let i = items.length - 1; i > 0; i--) {
    rng = (rng + 0x6d2b79f5) >>> 0
    let t = Math.imul(rng ^ (rng >>> 15), 1 | rng)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    const j = Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return { items, rng }
}
