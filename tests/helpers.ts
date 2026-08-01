import type { LanguagePlugin, TokenScope } from '../index.ts'

export interface Segment {
  text: string
  scope?: TokenScope
}

export function tokenize(chunks: string[], plugin: LanguagePlugin): Segment[] {
  const lexer = plugin.createLexer()
  const segments: Segment[] = []
  const emit = (text: string, scope?: TokenScope) =>
    append(segments, text, scope)

  for (const chunk of chunks) lexer.write(chunk, emit)
  lexer.end(emit)
  return segments
}

function append(segments: Segment[], text: string, scope?: TokenScope): void {
  if (text.length === 0) return
  const previous = segments.at(-1)
  if (previous && previous.scope === scope) {
    previous.text += text
    return
  }
  segments.push(scope ? { text, scope } : { text })
}

export function findScopes(
  segments: Segment[],
  text: string,
): Array<TokenScope | undefined> {
  return segments
    .filter(segment => segment.text === text)
    .map(segment => segment.scope)
}
