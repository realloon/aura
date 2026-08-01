import { describe, expect, test } from 'bun:test'
import { csharp } from '../../index.ts'
import { findScopes, tokenize } from '../helpers.ts'

describe('C# plugin', () => {
  const source = `#nullable enable
public sealed record User(string Name)
{
    // LLM output may split anywhere
    public string Greet(int count) => $"Hello, {Name}! {count + 1}";
    public string Json => "{\"ok\": true}";
    public string Path => @"C:\\tmp\\""quoted""";
    public string Raw => """<raw>""";
    public char Initial => 'A';
    public bool Ready => true;
    /* done */
}`

  test('classifies representative C# syntax', () => {
    const segments = tokenize([source], csharp)
    expect(findScopes(segments, 'public')).toEqual([
      'keyword',
      'keyword',
      'keyword',
      'keyword',
      'keyword',
      'keyword',
      'keyword',
    ])
    expect(findScopes(segments, 'string')).toEqual([
      'type',
      'type',
      'type',
      'type',
      'type',
    ])
    expect(findScopes(segments, 'true')).toEqual(['literal'])
    expect(findScopes(segments, '#nullable enable')).toEqual(['meta'])
    expect(findScopes(segments, '// LLM output may split anywhere')).toEqual([
      'comment',
    ])
    expect(findScopes(segments, '/* done */')).toEqual(['comment'])
  })

  test('keeps tokenization stable across arbitrary stream boundaries', () => {
    const expected = tokenize([source], csharp)

    for (let split = 0; split <= source.length; split++) {
      expect(
        tokenize([source.slice(0, split), source.slice(split)], csharp),
      ).toEqual(expected)
    }

    expect(tokenize([...source], csharp)).toEqual(expected)
  })

  test('flushes an incomplete final token', () => {
    expect(tokenize(['pub', 'lic'], csharp)).toEqual([
      { text: 'public', scope: 'keyword' },
    ])
    expect(tokenize(['identifier'], csharp)).toEqual([{ text: 'identifier' }])
  })
})
