import type {
  LanguageLexer,
  LanguagePlugin,
  TokenSink,
} from '../types/index.js'
import {
  createWordSet,
  isAsciiDigit,
  isAsciiLetter,
  isWhitespace,
  scanWhitespace,
} from '../shared/lexer.js'

const enum Mode {
  Normal,
  String,
  Number,
  Literal,
  PlainWord,
}

const LITERALS = createWordSet('false null true')
const MAX_LITERAL_LENGTH = Math.max(...[...LITERALS].map(word => word.length))

export const json: LanguagePlugin = {
  name: 'json',
  createLexer: () => new JsonLexer(),
}

class JsonLexer implements LanguageLexer {
  #mode = Mode.Normal
  #escaped = false
  #pendingLiteral = ''
  #numberAllowsSign = false

  write(chunk: string, emit: TokenSink) {
    let index = 0
    while (index < chunk.length) {
      switch (this.#mode) {
        case Mode.String:
          index = this.#scanString(chunk, index, emit)
          break
        case Mode.Number:
          index = this.#scanNumber(chunk, index, emit)
          break
        case Mode.Literal:
          index = this.#scanLiteral(chunk, index, emit)
          break
        case Mode.PlainWord:
          index = this.#scanPlainWord(chunk, index, emit)
          break
        default:
          index = this.#scanNormal(chunk, index, emit)
      }
    }
  }

  end(emit: TokenSink) {
    if (this.#pendingLiteral.length > 0) {
      emit(
        this.#pendingLiteral,
        LITERALS.has(this.#pendingLiteral) ? 'literal' : undefined,
      )
      this.#pendingLiteral = ''
    }
  }

  #scanNormal(input: string, index: number, emit: TokenSink) {
    const code = input.charCodeAt(index)
    const character = input[index]!

    if (isWhitespace(code)) {
      const end = scanWhitespace(input, index)
      emit(input.slice(index, end))
      return end
    }

    if (character === '"') {
      this.#mode = Mode.String
      this.#escaped = false
      emit(character, 'string')
      return index + 1
    }

    if (character === '-' || isAsciiDigit(code)) {
      this.#mode = Mode.Number
      this.#numberAllowsSign = false
      return this.#scanNumber(input, index, emit)
    }

    if (isAsciiLetter(code)) {
      this.#mode = Mode.Literal
      return this.#scanLiteral(input, index, emit)
    }

    if ('{}[],:'.includes(character)) {
      emit(character, 'punctuation')
      return index + 1
    }

    emit(character)
    return index + 1
  }

  #scanString(input: string, index: number, emit: TokenSink) {
    let end = index
    while (end < input.length) {
      const character = input[end]
      const code = input.charCodeAt(end)

      if (this.#escaped) {
        this.#escaped = false
        end++
        continue
      }
      if (character === '\\') {
        this.#escaped = true
        end++
        continue
      }
      if (character === '"') {
        end++
        emit(input.slice(index, end), 'string')
        this.#mode = Mode.Normal
        return end
      }
      if (code === 10 || code === 13) {
        emit(input.slice(index, end), 'string')
        this.#mode = Mode.Normal
        return end
      }
      end++
    }

    emit(input.slice(index), 'string')
    return input.length
  }

  #scanNumber(input: string, index: number, emit: TokenSink) {
    let end = index
    while (end < input.length) {
      const code = input.charCodeAt(end)
      if (code === 45 && end === index) {
        end++
        continue
      }
      if (isAsciiDigit(code) || code === 46) {
        this.#numberAllowsSign = false
        end++
        continue
      }
      if (code === 69 || code === 101) {
        this.#numberAllowsSign = true
        end++
        continue
      }
      if ((code === 43 || code === 45) && this.#numberAllowsSign) {
        this.#numberAllowsSign = false
        end++
        continue
      }
      break
    }

    emit(input.slice(index, end), 'number')
    if (end < input.length || end === index) this.#mode = Mode.Normal
    return end
  }

  #scanLiteral(input: string, index: number, emit: TokenSink) {
    let end = index
    while (end < input.length && isAsciiLetter(input.charCodeAt(end))) end++

    const word = this.#pendingLiteral + input.slice(index, end)
    this.#pendingLiteral = ''

    if (end === input.length) {
      if (word.length > MAX_LITERAL_LENGTH) {
        emit(word)
        this.#mode = Mode.PlainWord
      } else {
        this.#pendingLiteral = word
      }
      return end
    }

    emit(word, LITERALS.has(word) ? 'literal' : undefined)
    this.#mode = Mode.Normal
    return end
  }

  #scanPlainWord(input: string, index: number, emit: TokenSink) {
    let end = index
    while (end < input.length && isAsciiLetter(input.charCodeAt(end))) end++
    emit(input.slice(index, end))
    if (end < input.length) this.#mode = Mode.Normal
    return end
  }
}
