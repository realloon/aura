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

export interface LanguageLexer {
  write(chunk: string, emit: TokenSink): void
  end(emit: TokenSink): void
}

export interface LanguagePlugin {
  readonly name: string
  readonly aliases?: readonly string[]
  createLexer(): LanguageLexer
}
