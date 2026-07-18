import type {
  LanguageLexer,
  LanguagePlugin,
  TokenScope,
} from './types/index.js'

export class Aura {
  readonly #languages = new Map<string, LanguagePlugin>()

  register(plugin: LanguagePlugin): this {
    const names = [plugin.name, ...(plugin.aliases ?? [])].map(normalizeName)
    const uniqueNames = new Set(names)

    if (uniqueNames.size !== names.length) {
      throw new Error(
        `Language plugin "${plugin.name}" contains duplicate names`,
      )
    }

    for (const name of uniqueNames) {
      if (this.#languages.has(name)) {
        throw new Error(`Language name "${name}" is already registered`)
      }
    }

    for (const name of uniqueNames) {
      this.#languages.set(name, plugin)
    }

    return this
  }

  has(language: string): boolean {
    return this.#languages.has(normalizeName(language))
  }

  createLexer(language: string): LanguageLexer {
    const normalized = normalizeName(language)
    const plugin = this.#languages.get(normalized)

    if (!plugin) {
      throw new Error(`Unknown language "${language}"`)
    }

    return plugin.createLexer()
  }

  createHighlighter(language: string): StreamingHighlighter {
    return new StreamingHighlighter(this.createLexer(language))
  }

  highlight(code: string, language: string): string {
    const highlighter = this.createHighlighter(language)
    return highlighter.write(code) + highlighter.finish()
  }
}

export class StreamingHighlighter {
  readonly #lexer: LanguageLexer
  #finished = false

  constructor(lexer: LanguageLexer) {
    this.#lexer = lexer
  }

  write(chunk: string): string {
    if (this.#finished) {
      throw new Error('Cannot write after the highlighter has finished')
    }

    return this.#render(emit => this.#lexer.write(chunk, emit))
  }

  finish(): string {
    if (this.#finished) {
      throw new Error('The highlighter has already finished')
    }

    this.#finished = true
    return this.#render(emit => this.#lexer.finish(emit))
  }

  #render(
    tokenize: (emit: (text: string, scope?: TokenScope) => void) => void,
  ): string {
    const output: string[] = []
    let pendingText = ''
    let pendingScope: TokenScope | undefined

    const flush = () => {
      if (pendingText.length === 0) return

      const escaped = escapeHtml(pendingText)
      output.push(
        pendingScope
          ? `<span class="aura-${pendingScope}">${escaped}</span>`
          : escaped,
      )
      pendingText = ''
    }

    tokenize((text, scope) => {
      if (text.length === 0) return
      if (pendingText.length > 0 && pendingScope !== scope) flush()
      pendingScope = scope
      pendingText += text
    })

    flush()
    return output.join('')
  }
}

function normalizeName(name: string): string {
  const normalized = name.trim().toLowerCase()
  if (normalized.length === 0) throw new Error('Language name cannot be empty')
  return normalized
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, character => {
    switch (character) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}
