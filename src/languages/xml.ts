import type {
  LanguageLexer,
  LanguagePlugin,
  TokenSink,
} from '../types/index.js'
import {
  isIdentifierPart,
  isIdentifierStart,
  isWhitespace,
  scanWhitespace,
} from '../shared/lexer.js'

const enum Mode {
  Text,
  Tag,
  TagName,
  AttributeName,
  DoubleQuotedValue,
  SingleQuotedValue,
  Entity,
  Comment,
  Cdata,
  ProcessingInstruction,
  Declaration,
}

export const xml: LanguagePlugin = {
  name: 'xml',
  createLexer: () => new XmlLexer(),
}

class XmlLexer implements LanguageLexer {
  #mode = Mode.Text
  #carry = ''
  #sectionCarry = ''

  write(chunk: string, emit: TokenSink) {
    let input = chunk
    if (this.#carry.length > 0) {
      input = this.#carry + input
      this.#carry = ''
    }

    let index = 0
    while (index < input.length) {
      switch (this.#mode) {
        case Mode.Tag:
          index = this.#scanTag(input, index, emit)
          break
        case Mode.TagName:
          index = this.#scanName(input, index, 'tag', emit)
          break
        case Mode.AttributeName:
          index = this.#scanName(input, index, 'attribute', emit)
          break
        case Mode.DoubleQuotedValue:
          index = this.#scanAttributeValue(input, index, '"', emit)
          break
        case Mode.SingleQuotedValue:
          index = this.#scanAttributeValue(input, index, "'", emit)
          break
        case Mode.Entity:
          index = this.#scanEntity(input, index, emit)
          break
        case Mode.Comment:
          index = this.#scanSection(input, index, '-->', 'comment', emit)
          break
        case Mode.Cdata:
          index = this.#scanSection(input, index, ']]>', 'string', emit)
          break
        case Mode.ProcessingInstruction:
          index = this.#scanSection(input, index, '?>', 'meta', emit)
          break
        case Mode.Declaration:
          index = this.#scanSection(input, index, '>', 'meta', emit)
          break
        default:
          index = this.#scanText(input, index, emit)
      }
    }
  }

  finish(emit: TokenSink) {
    if (this.#carry.length > 0) {
      emit(this.#carry, this.#carry.startsWith('<!') ? 'meta' : 'punctuation')
      this.#carry = ''
    }

    if (this.#sectionCarry.length > 0) {
      emit(this.#sectionCarry, sectionScope(this.#mode))
      this.#sectionCarry = ''
    }
  }

  #scanText(input: string, index: number, emit: TokenSink) {
    const character = input[index]
    if (character === '<') return this.#startMarkup(input, index, emit)
    if (character === '&') {
      this.#mode = Mode.Entity
      return this.#scanEntity(input, index, emit)
    }

    let end = index + 1
    while (end < input.length && input[end] !== '<' && input[end] !== '&') end++
    emit(input.slice(index, end))
    return end
  }

  #startMarkup(input: string, index: number, emit: TokenSink) {
    const remaining = input.slice(index)

    if (
      (remaining.length < 4 && '<!--'.startsWith(remaining)) ||
      (remaining.length < 9 && '<![CDATA['.startsWith(remaining)) ||
      (remaining.length < 2 && '<?'.startsWith(remaining))
    ) {
      this.#carry = remaining
      return input.length
    }

    if (remaining.startsWith('<!--')) {
      this.#mode = Mode.Comment
      emit('<!--', 'comment')
      return index + 4
    }

    if (remaining.startsWith('<![CDATA[')) {
      this.#mode = Mode.Cdata
      emit('<![CDATA[', 'string')
      return index + 9
    }

    if (remaining.startsWith('<?')) {
      this.#mode = Mode.ProcessingInstruction
      emit('<?', 'meta')
      return index + 2
    }

    if (remaining.startsWith('<!')) {
      this.#mode = Mode.Declaration
      emit('<!', 'meta')
      return index + 2
    }

    if (remaining.startsWith('</')) {
      this.#mode = Mode.TagName
      emit('</', 'punctuation')
      return index + 2
    }

    if (remaining.length > 1 && isNameStart(input.charCodeAt(index + 1))) {
      this.#mode = Mode.TagName
      emit('<', 'punctuation')
      return index + 1
    }

    emit('<', 'punctuation')
    return index + 1
  }

  #scanTag(input: string, index: number, emit: TokenSink) {
    const code = input.charCodeAt(index)
    const character = input[index]

    if (isWhitespace(code)) {
      const end = scanWhitespace(input, index)
      emit(input.slice(index, end))
      return end
    }

    if (character === '>') {
      this.#mode = Mode.Text
      emit('>', 'punctuation')
      return index + 1
    }

    if (character === '"' || character === "'") {
      this.#mode =
        character === '"' ? Mode.DoubleQuotedValue : Mode.SingleQuotedValue
      emit(character, 'string')
      return index + 1
    }

    if (isNameStart(code)) {
      this.#mode = Mode.AttributeName
      return this.#scanName(input, index, 'attribute', emit)
    }

    emit(
      character,
      character === '/' || character === '=' ? 'punctuation' : undefined,
    )
    return index + 1
  }

  #scanName(
    input: string,
    index: number,
    scope: 'tag' | 'attribute',
    emit: TokenSink,
  ) {
    let end = index
    while (end < input.length && isNamePart(input.charCodeAt(end))) end++
    emit(input.slice(index, end), scope)
    if (end < input.length) this.#mode = Mode.Tag
    return end
  }

  #scanAttributeValue(
    input: string,
    index: number,
    quote: '"' | "'",
    emit: TokenSink,
  ) {
    const closing = input.indexOf(quote, index)
    if (closing === -1) {
      emit(input.slice(index), 'string')
      return input.length
    }

    emit(input.slice(index, closing + 1), 'string')
    this.#mode = Mode.Tag
    return closing + 1
  }

  #scanEntity(input: string, index: number, emit: TokenSink) {
    let end = index
    while (end < input.length) {
      const character = input[end]
      if (character === ';') {
        end++
        emit(input.slice(index, end), 'literal')
        this.#mode = Mode.Text
        return end
      }
      if (character === '<' || isWhitespace(input.charCodeAt(end))) {
        emit(input.slice(index, end), 'literal')
        this.#mode = Mode.Text
        return end
      }
      end++
    }

    emit(input.slice(index), 'literal')
    return input.length
  }

  #scanSection(
    input: string,
    index: number,
    terminator: string,
    scope: 'comment' | 'meta' | 'string',
    emit: TokenSink,
  ) {
    const prefixLength = this.#sectionCarry.length
    const text = this.#sectionCarry + input.slice(index)
    const closing = text.indexOf(terminator)
    this.#sectionCarry = ''

    if (closing !== -1) {
      const end = closing + terminator.length
      emit(text.slice(0, end), scope)
      this.#mode = Mode.Text
      return index + end - prefixLength
    }

    const keep = Math.min(terminator.length - 1, text.length)
    const emitEnd = text.length - keep
    emit(text.slice(0, emitEnd), scope)
    this.#sectionCarry = text.slice(emitEnd)
    return input.length
  }
}

function sectionScope(mode: Mode) {
  if (mode === Mode.Comment) return 'comment'
  if (mode === Mode.Cdata) return 'string'
  return 'meta'
}

function isNameStart(code: number) {
  return code === 58 || isIdentifierStart(code)
}

function isNamePart(code: number) {
  return (
    isNameStart(code) || isIdentifierPart(code) || code === 45 || code === 46
  )
}
