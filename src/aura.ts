import type {
  HighlightBinding,
  LanguageLexer,
  LanguagePlugin,
  TokenScope,
} from './types/index.js'

interface HighlightLike {
  add(range: Range): unknown
  delete(range: Range): boolean
  readonly size: number
}

interface HighlightRegistryLike {
  delete(name: string): boolean
  get(name: string): HighlightLike | undefined
  set(name: string, highlight: HighlightLike): unknown
}

interface HighlightWindow extends Window {
  CSS?: { highlights?: HighlightRegistryLike }
  Highlight?: new () => HighlightLike
}

interface HighlightContext {
  document: Document
  Highlight: new () => HighlightLike
  registry: HighlightRegistryLike
  highlights: Map<string, HighlightLike>
}

const highlightsByDocument = new WeakMap<Document, Map<string, HighlightLike>>()

export class Aura {
  readonly #languages = new Map<string, LanguagePlugin>()

  register(plugins: readonly LanguagePlugin[]) {
    const pending = new Map<string, LanguagePlugin>()

    for (const plugin of plugins) {
      const names = [plugin.name, ...(plugin.aliases ?? [])].map(normalizeName)
      const uniqueNames = new Set(names)

      if (uniqueNames.size !== names.length) {
        throw new Error(
          `Language plugin "${plugin.name}" contains duplicate names`,
        )
      }

      for (const name of uniqueNames) {
        if (this.#languages.has(name) || pending.has(name)) {
          throw new Error(`Language name "${name}" is already registered`)
        }
        pending.set(name, plugin)
      }
    }

    for (const [name, plugin] of pending) {
      this.#languages.set(name, plugin)
    }

    return this
  }

  has(language: string) {
    return this.#languages.has(normalizeName(language))
  }

  createLexer(language: string) {
    const normalized = normalizeName(language)
    const plugin = this.#languages.get(normalized)

    if (!plugin) {
      throw new Error(`Unknown language "${language}"`)
    }

    return plugin.createLexer()
  }

  highlight(code: Element, language: string): HighlightBinding {
    if (code.childNodes.length !== 0) {
      throw new Error('Aura can only highlight an empty element')
    }

    const lexer = this.createLexer(language)
    const context = getHighlightContext(code.ownerDocument)
    const text = code.ownerDocument.createTextNode('')
    code.append(text)
    return new BoundHighlighter(lexer, text, context)
  }
}

class BoundHighlighter implements HighlightBinding {
  readonly #lexer: LanguageLexer
  readonly #text: Text
  readonly #context: HighlightContext
  readonly #ranges: Array<{
    highlight: HighlightLike
    name: string
    range: Range
  }> = []
  #emitted = 0
  #ended = false
  #disposed = false

  constructor(lexer: LanguageLexer, text: Text, context: HighlightContext) {
    this.#lexer = lexer
    this.#text = text
    this.#context = context
  }

  write(chunk: string) {
    this.#assertWritable()
    if (chunk.length === 0) return

    this.#text.appendData(chunk)
    this.#lexer.write(chunk, this.#emit)
  }

  end() {
    this.#assertWritable()
    this.#ended = true
    this.#lexer.end(this.#emit)

    if (this.#emitted !== this.#text.length) {
      throw new Error('Language lexer did not emit all bound source text')
    }
  }

  dispose() {
    if (this.#disposed) return
    this.#disposed = true

    for (const { highlight, name, range } of this.#ranges) {
      highlight.delete(range)
      if (highlight.size === 0) {
        this.#context.highlights.delete(name)
        if (this.#context.registry.get(name) === highlight) {
          this.#context.registry.delete(name)
        }
      }
    }
    this.#ranges.length = 0
  }

  readonly #emit = (value: string, scope?: TokenScope) => {
    if (value.length === 0) return

    const start = this.#emitted
    const end = start + value.length
    if (this.#text.data.slice(start, end) !== value) {
      throw new Error('Language lexer emitted text out of source order')
    }
    this.#emitted = end

    if (!scope) return

    const name = `aura-${scope}`
    let highlight = this.#context.highlights.get(name)
    if (!highlight) {
      const created = new this.#context.Highlight()
      this.#context.highlights.set(name, created)
      this.#context.registry.set(name, created)
      highlight = created
    }

    const range = this.#context.document.createRange()
    range.setStart(this.#text, start)
    range.setEnd(this.#text, end)
    highlight.add(range)
    this.#ranges.push({ highlight, name, range })
  }

  #assertWritable() {
    if (this.#disposed) {
      throw new Error('Cannot write after the highlighter has been disposed')
    }
    if (this.#ended) {
      throw new Error('Cannot write after the highlighter has ended')
    }
  }
}

function normalizeName(name: string) {
  const normalized = name.trim().toLowerCase()
  if (normalized.length === 0) throw new Error('Language name cannot be empty')
  return normalized
}

function getHighlightContext(document: Document): HighlightContext {
  const view = document.defaultView as HighlightWindow | null
  const registry = view?.CSS?.highlights
  if (!registry || !view?.Highlight) {
    throw new Error(
      'CSS Custom Highlight API is not available in this document',
    )
  }

  let highlights = highlightsByDocument.get(document)
  if (!highlights) {
    highlights = new Map()
    highlightsByDocument.set(document, highlights)
  }
  return { document, Highlight: view.Highlight, registry, highlights }
}
