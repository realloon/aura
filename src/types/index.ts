export type TokenScope =
  | 'attribute'
  | 'comment'
  | 'keyword'
  | 'literal'
  | 'meta'
  | 'number'
  | 'operator'
  | 'punctuation'
  | 'string'
  | 'tag'
  | 'type'
  | (string & {})

export type TokenSink = (text: string, scope?: TokenScope) => void

/** A syntax highlighter bound to one DOM element. */
export interface HighlightBinding {
  write(chunk: string): void
  end(): void
  dispose(): void
}

export interface LanguageLexer {
  write(chunk: string, emit: TokenSink): void
  end(emit: TokenSink): void
}

export interface LanguagePlugin {
  readonly name: string
  readonly aliases?: readonly string[]
  createLexer(): LanguageLexer
}
