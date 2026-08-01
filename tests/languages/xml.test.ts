import { describe, expect, test } from 'bun:test'
import { xml } from '../../index.ts'
import { findScopes, tokenize } from '../helpers.ts'

describe('XML plugin', () => {
  const source = `<?xml version="1.0"?>
<!DOCTYPE catalog>
<catalog xmlns:x="urn:demo" enabled='true'>
  <!-- generated -->
  <x:item id="42">Text &amp; more</x:item>
  <![CDATA[<raw value="1">]]>
  <empty />
</catalog>`

  test('classifies representative XML syntax', () => {
    const segments = tokenize([source], xml)
    expect(findScopes(segments, '<?xml version="1.0"?>')).toEqual(['meta'])
    expect(findScopes(segments, '<!DOCTYPE catalog>')).toEqual(['meta'])
    expect(findScopes(segments, 'catalog')).toEqual(['tag', 'tag'])
    expect(findScopes(segments, 'x:item')).toEqual(['tag', 'tag'])
    expect(findScopes(segments, 'xmlns:x')).toEqual(['attribute'])
    expect(findScopes(segments, 'id')).toEqual(['attribute'])
    expect(findScopes(segments, '"42"')).toEqual(['string'])
    expect(findScopes(segments, '&amp;')).toEqual(['literal'])
    expect(findScopes(segments, '<!-- generated -->')).toEqual(['comment'])
    expect(findScopes(segments, '<![CDATA[<raw value="1">]]>')).toEqual([
      'string',
    ])
  })

  test('keeps tokenization stable across arbitrary stream boundaries', () => {
    const expected = tokenize([source], xml)

    for (let split = 0; split <= source.length; split++) {
      expect(
        tokenize([source.slice(0, split), source.slice(split)], xml),
      ).toEqual(expected)
    }

    expect(tokenize([...source], xml)).toEqual(expected)
  })
})
