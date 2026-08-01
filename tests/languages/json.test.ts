import { describe, expect, test } from 'bun:test'
import { json } from '../../index.ts'
import { findScopes, tokenize } from '../helpers.ts'

describe('JSON plugin', () => {
  const source = [
    '{',
    '  "name": "aura",',
    '  "enabled": true,',
    '  "count": -1.25e+2,',
    '  "value": null,',
    '  "items": [1, false],',
    '  "escaped": "quote: \\" and slash \\\\",',
    '}',
  ].join('\n')

  test('classifies representative JSON syntax', () => {
    const segments = tokenize([source], json)
    expect(findScopes(segments, '"aura"')).toEqual(['string'])
    expect(findScopes(segments, 'true')).toEqual(['literal'])
    expect(findScopes(segments, 'false')).toEqual(['literal'])
    expect(findScopes(segments, 'null')).toEqual(['literal'])
    expect(findScopes(segments, '-1.25e+2')).toEqual(['number'])
    expect(findScopes(segments, '"quote: \\" and slash \\\\"')).toEqual([
      'string',
    ])
  })

  test('keeps tokenization stable across arbitrary stream boundaries', () => {
    const expected = tokenize([source], json)

    for (let split = 0; split <= source.length; split++) {
      expect(
        tokenize([source.slice(0, split), source.slice(split)], json),
      ).toEqual(expected)
    }

    expect(tokenize([...source], json)).toEqual(expected)
  })
})
