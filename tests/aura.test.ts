import { describe, expect, test } from 'bun:test'
import { Aura, csharp } from '../index.ts'

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

  test('renders escaped HTML', () => {
    const aura = new Aura().register([csharp])
    expect(aura.highlight('string text = "<tag>";', 'csharp')).toBe(
      '<span class="aura-type">string</span> text <span class="aura-operator">=</span> <span class="aura-string">&quot;&lt;tag&gt;&quot;</span><span class="aura-punctuation">;</span>',
    )
  })

  test('enforces the streaming lifecycle', () => {
    const stream = new Aura().register([csharp]).createHighlighter('cs')
    stream.end()
    expect(() => stream.write('public')).toThrow(
      'Cannot write after the highlighter has ended',
    )
    expect(() => stream.end()).toThrow('The highlighter has already ended')
  })
})
