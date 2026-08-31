import { describe, expect, test } from 'bun:test'
import { Aura, csharp } from '../index.ts'

class FakeRange {
  endOffset = 0
  startOffset = 0

  setEnd(_node: Node, offset: number) {
    this.endOffset = offset
  }

  setStart(_node: Node, offset: number) {
    this.startOffset = offset
  }
}

class FakeText {
  data = ''

  get length() {
    return this.data.length
  }

  appendData(value: string) {
    this.data += value
  }
}

class FakeHighlight extends Set<FakeRange> {}

class FakeDocument {
  readonly defaultView = {
    CSS: { highlights: new Map<string, FakeHighlight>() },
    Highlight: FakeHighlight,
  }

  createRange() {
    return new FakeRange()
  }

  createTextNode() {
    return new FakeText()
  }
}

class FakeCode {
  readonly childNodes: FakeText[] = []

  constructor(readonly ownerDocument: FakeDocument) {}

  append(text: FakeText) {
    this.childNodes.push(text)
  }
}

describe('Aura', () => {
  test('registers aliases and rejects unknown languages', () => {
    const aura = new Aura().register([csharp])
    expect(aura.has('C#')).toBe(true)
    expect(aura.has('cs')).toBe(true)
    expect(() => aura.createLexer('rust')).toThrow('Unknown language "rust"')
  })

  test('rejects conflicting plugins instead of silently replacing them', () => {
    const aura = new Aura().register([csharp])
    expect(() => aura.register([csharp])).toThrow(
      'Language name "csharp" is already registered',
    )
  })

  test('does not partially register a conflicting batch', () => {
    const conflicting = { ...csharp, name: 'custom', aliases: ['cs'] }
    const aura = new Aura()

    expect(() => aura.register([csharp, conflicting])).toThrow(
      'Language name "cs" is already registered',
    )
    expect(aura.has('csharp')).toBe(false)
    expect(aura.has('custom')).toBe(false)
  })

  test('highlights ranges on one stable text node and releases only its own ranges', () => {
    const document = new FakeDocument()
    const aura = new Aura().register([csharp])
    const firstCode = new FakeCode(document)
    const first = aura.highlight(firstCode as unknown as Element, 'csharp')
    const firstText = firstCode.childNodes[0]!

    first.write('pub')
    expect(firstText.data).toBe('pub')
    expect(document.defaultView.CSS.highlights.size).toBe(0)

    first.write('lic ')
    first.write('string ')
    first.end()
    expect(() => first.write('public')).toThrow(
      'Cannot write after the highlighter has ended',
    )
    expect(() => first.end()).toThrow(
      'Cannot write after the highlighter has ended',
    )

    expect(firstCode.childNodes).toEqual([firstText])
    expect(firstText.data).toBe('public string ')
    const keyword = document.defaultView.CSS.highlights.get('aura-keyword')!
    const keywordRange = [...keyword][0]!
    expect(keywordRange.startOffset).toBe(0)
    expect(keywordRange.endOffset).toBe(6)

    const secondCode = new FakeCode(document)
    const second = aura.highlight(secondCode as unknown as Element, 'csharp')
    second.write('public ')
    second.end()
    expect(keyword.size).toBe(2)

    first.dispose()
    expect(keyword.size).toBe(1)
    expect(document.defaultView.CSS.highlights.has('aura-keyword')).toBe(true)

    second.dispose()
    expect(document.defaultView.CSS.highlights.has('aura-keyword')).toBe(false)
  })
})
