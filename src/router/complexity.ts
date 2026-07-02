import { ChatMessage, ComplexityResult, ComplexityTier } from '../types'

// Heuristic complexity scorer. Free and local: no extra LLM call. It turns a
// coding prompt into a 0..1 score by combining a handful of cheap signals, so
// the router can send "large refactor" prompts to a stronger model and "fix
// this typo" prompts to a lighter one.

const HIGH_COMPLEXITY_TERMS = [
  'refactor',
  'architecture',
  'architect',
  'design',
  'migrate',
  'migration',
  'rewrite',
  'redesign',
  'concurrency',
  'thread',
  'race condition',
  'optimize',
  'optimization',
  'performance',
  'scalable',
  'distributed',
  'algorithm',
  'data structure',
  'debug',
  'root cause',
  'implement',
  'end-to-end',
  'across the codebase',
  'multiple files',
  'system design',
]

const LOW_COMPLEXITY_TERMS = [
  'typo',
  'rename',
  'format',
  'lint',
  'comment',
  'one-liner',
  'small fix',
  'quick',
  'trivial',
  'simple',
  'add a log',
  'print',
]

// Rough token estimate; ~4 chars per token is close enough for routing.
const estimateTokens = (text: string): number => Math.ceil(text.length / 4)

const flatten = (messages: ChatMessage[]): string =>
  messages
    .map((m) => {
      if (typeof m.content === 'string') return m.content
      if (Array.isArray(m.content))
        return m.content.map((p) => p.text || '').join(' ')
      return ''
    })
    .join('\n')

const countMatches = (haystack: string, terms: string[]): number =>
  terms.reduce((acc, term) => (haystack.includes(term) ? acc + 1 : acc), 0)

const countCodeBlocks = (text: string): number => {
  const fences = text.match(/```/g)
  return fences ? Math.floor(fences.length / 2) : 0
}

const countFileMentions = (text: string): number => {
  const matches = text.match(/[\w./-]+\.(ts|tsx|js|jsx|py|go|rs|java|c|cpp|h|rb|php|cs|kt|swift|sql|json|yaml|yml|md|sh)\b/gi)
  return matches ? matches.length : 0
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

const toTier = (score: number): ComplexityTier => {
  if (score < 0.25) return 'trivial'
  if (score < 0.5) return 'simple'
  if (score < 0.75) return 'moderate'
  return 'complex'
}

export const scoreComplexity = (
  messages: ChatMessage[],
  hint?: number,
): ComplexityResult => {
  // An explicit caller hint overrides the heuristic entirely.
  if (typeof hint === 'number' && Number.isFinite(hint)) {
    const score = clamp01(hint)
    return { score, tier: toTier(score), signals: { hint: score } }
  }

  const text = flatten(messages)
  const lower = text.toLowerCase()
  const tokens = estimateTokens(text)

  // Each signal contributes an independent 0..1 term; weights sum the mix.
  const lengthSignal = clamp01(tokens / 1500)
  const codeSignal = clamp01(countCodeBlocks(text) / 3)
  const fileSignal = clamp01(countFileMentions(lower) / 4)
  const highTermSignal = clamp01(countMatches(lower, HIGH_COMPLEXITY_TERMS) / 3)
  const lowTermPenalty = clamp01(countMatches(lower, LOW_COMPLEXITY_TERMS) / 2)
  const turnSignal = clamp01(messages.length / 12)

  // Keyword and file signals carry the most weight: a short but explicitly
  // "refactor the whole architecture across these files" prompt is complex even
  // without much raw length, so length alone must not dominate the score.
  const raw =
    0.35 * highTermSignal +
    0.2 * fileSignal +
    0.2 * lengthSignal +
    0.15 * codeSignal +
    0.1 * turnSignal

  // Low-complexity language pulls the score back down toward "simple edit".
  const score = clamp01(raw - 0.25 * lowTermPenalty)

  return {
    score,
    tier: toTier(score),
    signals: {
      tokens,
      lengthSignal,
      codeSignal,
      fileSignal,
      highTermSignal,
      lowTermPenalty,
      turnSignal,
    },
  }
}
