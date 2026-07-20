import type {
  LanguageLexer,
  LanguagePlugin,
  TokenScope,
  TokenSink,
} from '../types/index.js'
import {
  createAsciiTable,
  createWordSet,
  isAsciiDigit,
  isIdentifierPart,
  isIdentifierStart,
  isWhitespace,
  scanWhitespace,
} from '../shared/lexer.js'

const enum Mode {
  Normal,
  PlainIdentifier,
  Number,
  LineComment,
  BlockComment,
  String,
  Character,
  VerbatimString,
  RawString,
  Preprocessor,
}

const KEYWORDS = createWordSet(`
  abstract as async await base break case catch checked class const continue
  default delegate do else enum event explicit extern file finally fixed for
  foreach from get global goto if implicit in init interface internal into is
  join let lock namespace new not on operator or orderby out override params
  partial private protected public readonly record ref remove required return
  scoped sealed select set sizeof stackalloc static struct switch this throw try
  typeof unchecked unsafe using value virtual volatile when where while with yield
`)
const TYPES = createWordSet(`
  bool byte char decimal double dynamic float int long nint nuint object sbyte
  short string uint ulong ushort void
`)
const LITERALS = createWordSet('false null true')
const PUNCTUATION = createAsciiTable('(),:;[]{}')
const OPERATORS = createAsciiTable('!#$%&*+-./<=>?^|~')
const MAX_SPECIAL_WORD_LENGTH = Math.max(
  ...[...KEYWORDS, ...TYPES, ...LITERALS].map(word => word.length),
)

export const csharp: LanguagePlugin = {
  name: 'csharp',
  aliases: ['c#', 'cs'],
  createLexer: () => new CSharpLexer(),
}

class CSharpLexer implements LanguageLexer {
  #mode = Mode.Normal
  #pendingWord = ''
  #carry = ''
  #escaped = false
  #blockCommentStar = false
  #verbatimQuote = false
  #rawDelimiter = 0
  #rawQuoteRun = 0
  #numberAllowsSign = false
  #lineOnlyWhitespace = true

  write(chunk: string, emit: TokenSink) {
    let input = chunk
    if (this.#carry.length > 0) {
      input = this.#carry + input
      this.#carry = ''
    }

    let index = 0
    while (index < input.length) {
      switch (this.#mode) {
        case Mode.PlainIdentifier:
          index = this.#scanPlainIdentifier(input, index, emit)
          break
        case Mode.Number:
          index = this.#scanNumber(input, index, emit)
          break
        case Mode.LineComment:
          index = this.#scanLine(input, index, 'comment', emit)
          break
        case Mode.BlockComment:
          index = this.#scanBlockComment(input, index, emit)
          break
        case Mode.String:
          index = this.#scanQuoted(input, index, '"', emit)
          break
        case Mode.Character:
          index = this.#scanQuoted(input, index, "'", emit)
          break
        case Mode.VerbatimString:
          index = this.#scanVerbatimString(input, index, emit)
          break
        case Mode.RawString:
          index = this.#scanRawString(input, index, emit)
          break
        case Mode.Preprocessor:
          index = this.#scanLine(input, index, 'meta', emit)
          break
        default:
          index = this.#scanNormal(input, index, emit)
      }
    }
  }

  end(emit: TokenSink) {
    if (this.#carry.length > 0) {
      const carry = this.#carry
      this.#carry = ''
      this.#finishCarry(carry, emit)
    }

    this.#flushPendingWord(emit)
  }

  #scanNormal(input: string, index: number, emit: TokenSink) {
    if (this.#pendingWord.length > 0) {
      return this.#continuePendingWord(input, index, emit)
    }

    const code = input.charCodeAt(index)

    if (isIdentifierStart(code)) {
      return this.#scanWord(input, index, emit)
    }

    if (isAsciiDigit(code)) {
      this.#mode = Mode.Number
      this.#numberAllowsSign = false
      return this.#scanNumber(input, index, emit)
    }

    if (isWhitespace(code)) {
      const end = scanWhitespace(input, index)
      const text = input.slice(index, end)
      this.#noteWhitespace(text)
      emit(text)
      return end
    }

    const character = input[index]
    switch (character) {
      case '/':
        return this.#startSlash(input, index, emit)
      case '"':
        return this.#startDoubleQuoted(input, index, index, emit)
      case "'":
        this.#lineOnlyWhitespace = false
        this.#mode = Mode.Character
        this.#escaped = false
        emit("'", 'string')
        return index + 1
      case '@':
        return this.#startAt(input, index, emit)
      case '$':
        return this.#startDollar(input, index, emit)
      case '#':
        if (this.#lineOnlyWhitespace) {
          this.#lineOnlyWhitespace = false
          this.#mode = Mode.Preprocessor
          return this.#scanLine(input, index, 'meta', emit)
        }
        break
      case '.':
        if (index + 1 === input.length) {
          this.#carry = '.'
          return input.length
        }
        if (isAsciiDigit(input.charCodeAt(index + 1))) {
          this.#mode = Mode.Number
          this.#numberAllowsSign = false
          return this.#scanNumber(input, index, emit)
        }
        break
    }

    this.#lineOnlyWhitespace = false
    if (isPunctuation(code)) {
      let end = index + 1
      while (end < input.length && isPunctuation(input.charCodeAt(end))) end++
      emit(input.slice(index, end), 'punctuation')
      return end
    }

    if (isOperator(code)) {
      let end = index + 1
      while (
        end < input.length &&
        isOperator(input.charCodeAt(end)) &&
        input[end] !== '/' &&
        input[end] !== '$'
      ) {
        end++
      }
      emit(input.slice(index, end), 'operator')
      return end
    }

    emit(character)
    return index + 1
  }

  #scanWord(input: string, index: number, emit: TokenSink) {
    let end = index + 1
    while (end < input.length && isIdentifierPart(input.charCodeAt(end))) end++

    const word = input.slice(index, end)
    this.#lineOnlyWhitespace = false

    if (end < input.length) {
      emit(word, wordScope(word))
      return end
    }

    if (word.length > MAX_SPECIAL_WORD_LENGTH) {
      emit(word)
      this.#mode = Mode.PlainIdentifier
    } else {
      this.#pendingWord = word
    }
    return end
  }

  #continuePendingWord(input: string, index: number, emit: TokenSink) {
    let end = index
    while (end < input.length && isIdentifierPart(input.charCodeAt(end))) end++

    const continuation = input.slice(index, end)
    if (
      this.#pendingWord.length + continuation.length >
      MAX_SPECIAL_WORD_LENGTH
    ) {
      emit(this.#pendingWord + continuation)
      this.#pendingWord = ''
      if (end === input.length) this.#mode = Mode.PlainIdentifier
      return end
    }

    this.#pendingWord += continuation
    if (end < input.length) this.#flushPendingWord(emit)
    return end
  }

  #scanPlainIdentifier(input: string, index: number, emit: TokenSink) {
    let end = index
    while (end < input.length && isIdentifierPart(input.charCodeAt(end))) end++
    emit(input.slice(index, end))
    if (end < input.length) this.#mode = Mode.Normal
    return end
  }

  #scanNumber(input: string, index: number, emit: TokenSink) {
    let end = index
    while (end < input.length) {
      const code = input.charCodeAt(end)
      if (isNumberPart(code)) {
        this.#numberAllowsSign = code === 69 || code === 101
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
    this.#lineOnlyWhitespace = false
    if (end < input.length) this.#mode = Mode.Normal
    return end
  }

  #startSlash(input: string, index: number, emit: TokenSink) {
    if (index + 1 === input.length) {
      this.#carry = '/'
      return input.length
    }

    const next = input[index + 1]
    this.#lineOnlyWhitespace = false
    if (next === '/') {
      this.#mode = Mode.LineComment
      return this.#scanLine(input, index, 'comment', emit)
    }
    if (next === '*') {
      this.#mode = Mode.BlockComment
      return this.#scanBlockComment(input, index, emit)
    }

    emit('/', 'operator')
    return index + 1
  }

  #scanLine(
    input: string,
    index: number,
    scope: 'comment' | 'meta',
    emit: TokenSink,
  ) {
    let end = index
    while (end < input.length) {
      const code = input.charCodeAt(end)
      if (code === 10 || code === 13) break
      end++
    }
    emit(input.slice(index, end), scope)
    if (end < input.length) this.#mode = Mode.Normal
    return end
  }

  #scanBlockComment(input: string, index: number, emit: TokenSink) {
    let end = index

    if (this.#blockCommentStar) {
      this.#blockCommentStar = false
      if (input[index] === '/') {
        emit('/', 'comment')
        this.#mode = Mode.Normal
        return index + 1
      }
    }

    while (end < input.length) {
      if (input[end] === '*' && input[end + 1] === '/') {
        end += 2
        emit(input.slice(index, end), 'comment')
        this.#mode = Mode.Normal
        return end
      }
      end++
    }

    emit(input.slice(index), 'comment')
    this.#blockCommentStar = input.endsWith('*')
    return input.length
  }

  #startDoubleQuoted(
    input: string,
    prefixStart: number,
    quoteIndex: number,
    emit: TokenSink,
  ) {
    let end = quoteIndex
    while (end < input.length && input[end] === '"') end++
    const quoteCount = end - quoteIndex

    if (end === input.length && quoteCount < 3) {
      this.#carry = input.slice(prefixStart)
      return input.length
    }

    this.#lineOnlyWhitespace = false
    if (quoteCount >= 3) {
      this.#mode = Mode.RawString
      this.#rawDelimiter = quoteCount
      this.#rawQuoteRun = 0
      emit(input.slice(prefixStart, end), 'string')
      return end
    }

    emit(input.slice(prefixStart, end), 'string')
    if (quoteCount === 1) {
      this.#mode = Mode.String
      this.#escaped = false
    }
    return end
  }

  #startAt(input: string, index: number, emit: TokenSink) {
    if (index + 1 === input.length) {
      this.#carry = '@'
      return input.length
    }

    if (input[index + 1] === '"') {
      this.#lineOnlyWhitespace = false
      this.#mode = Mode.VerbatimString
      this.#verbatimQuote = false
      emit('@"', 'string')
      return index + 2
    }

    if (input[index + 1] === '$' && index + 2 === input.length) {
      this.#carry = '@$'
      return input.length
    }

    if (input[index + 1] === '$' && input[index + 2] === '"') {
      this.#lineOnlyWhitespace = false
      this.#mode = Mode.VerbatimString
      this.#verbatimQuote = false
      emit('@$"', 'string')
      return index + 3
    }

    if (isIdentifierStart(input.charCodeAt(index + 1))) {
      let end = index + 2
      while (end < input.length && isIdentifierPart(input.charCodeAt(end)))
        end++
      emit(input.slice(index, end))
      this.#lineOnlyWhitespace = false
      if (end === input.length) this.#mode = Mode.PlainIdentifier
      return end
    }

    this.#lineOnlyWhitespace = false
    emit('@')
    return index + 1
  }

  #startDollar(input: string, index: number, emit: TokenSink) {
    let dollarsEnd = index + 1
    while (dollarsEnd < input.length && input[dollarsEnd] === '$') dollarsEnd++

    if (dollarsEnd === input.length) {
      this.#carry = input.slice(index)
      return input.length
    }

    if (
      dollarsEnd === index + 1 &&
      input[dollarsEnd] === '@' &&
      dollarsEnd + 1 === input.length
    ) {
      this.#carry = '$@'
      return input.length
    }

    if (
      dollarsEnd === index + 1 &&
      input[dollarsEnd] === '@' &&
      input[dollarsEnd + 1] === '"'
    ) {
      this.#lineOnlyWhitespace = false
      this.#mode = Mode.VerbatimString
      this.#verbatimQuote = false
      emit('$@"', 'string')
      return dollarsEnd + 2
    }

    if (input[dollarsEnd] === '"') {
      return this.#startDoubleQuoted(input, index, dollarsEnd, emit)
    }

    this.#lineOnlyWhitespace = false
    emit(input.slice(index, dollarsEnd), 'operator')
    return dollarsEnd
  }

  #scanQuoted(input: string, index: number, quote: '"' | "'", emit: TokenSink) {
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
      if (character === quote) {
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

  #scanVerbatimString(input: string, index: number, emit: TokenSink) {
    if (this.#verbatimQuote) {
      this.#verbatimQuote = false
      if (input[index] !== '"') {
        this.#mode = Mode.Normal
        return index
      }
      emit('"', 'string')
      index++
      if (index === input.length) return index
    }

    let end = index
    while (end < input.length) {
      if (input[end] !== '"') {
        end++
        continue
      }

      if (end + 1 === input.length) {
        emit(input.slice(index), 'string')
        this.#verbatimQuote = true
        return input.length
      }

      if (input[end + 1] === '"') {
        end += 2
        continue
      }

      end++
      emit(input.slice(index, end), 'string')
      this.#mode = Mode.Normal
      return end
    }

    emit(input.slice(index), 'string')
    return input.length
  }

  #scanRawString(input: string, index: number, emit: TokenSink) {
    let end = index
    while (end < input.length) {
      if (input[end] === '"') {
        this.#rawQuoteRun++
        end++
        if (this.#rawQuoteRun === this.#rawDelimiter) {
          emit(input.slice(index, end), 'string')
          this.#rawQuoteRun = 0
          this.#mode = Mode.Normal
          return end
        }
      } else {
        this.#rawQuoteRun = 0
        end++
      }
    }

    emit(input.slice(index), 'string')
    return input.length
  }

  #finishCarry(carry: string, emit: TokenSink) {
    if (carry === '/' || carry === '$' || carry === '.') {
      emit(carry, 'operator')
      return
    }
    if (carry === '@') {
      emit(carry)
      return
    }
    if (carry === '@$' || carry === '$@') {
      emit(carry, 'operator')
      return
    }

    const firstQuote = carry.indexOf('"')
    if (firstQuote === -1) {
      emit(carry, 'operator')
      return
    }

    emit(carry, 'string')
  }

  #flushPendingWord(emit: TokenSink) {
    if (this.#pendingWord.length === 0) return
    emit(this.#pendingWord, wordScope(this.#pendingWord))
    this.#pendingWord = ''
  }

  #noteWhitespace(text: string) {
    const lastNewline = Math.max(text.lastIndexOf('\n'), text.lastIndexOf('\r'))
    if (lastNewline !== -1) this.#lineOnlyWhitespace = true
  }
}

function wordScope(word: string): TokenScope | undefined {
  if (KEYWORDS.has(word)) return 'keyword'
  if (TYPES.has(word)) return 'type'
  if (LITERALS.has(word)) return 'literal'
  return undefined
}

function isNumberPart(code: number) {
  const lower = code | 32
  return (
    isAsciiDigit(code) ||
    code === 46 ||
    code === 95 ||
    (lower >= 97 && lower <= 102) ||
    lower === 108 ||
    lower === 109 ||
    lower === 117 ||
    lower === 120
  )
}

function isPunctuation(code: number) {
  return PUNCTUATION[code] === 1
}

function isOperator(code: number) {
  return OPERATORS[code] === 1
}
