import { describe, expect, test } from "bun:test";
import { Aura, csharp } from "../src/main";
import type { TokenScope } from "../src/main";

interface Segment {
  text: string;
  scope?: TokenScope;
}

describe("Aura", () => {
  test("registers aliases and rejects unknown languages", () => {
    const aura = new Aura().register([csharp]);
    expect(aura.has("C#")).toBe(true);
    expect(aura.has("cs")).toBe(true);
    expect(() => aura.createLexer("rust")).toThrow('Unknown language "rust"');
  });

  test("rejects conflicting plugins instead of silently replacing them", () => {
    const aura = new Aura().register([csharp]);
    expect(() => aura.register([csharp])).toThrow(
      'Language name "csharp" is already registered',
    );
  });

  test("does not partially register a conflicting batch", () => {
    const conflicting = { ...csharp, name: "custom", aliases: ["cs"] };
    const aura = new Aura();

    expect(() => aura.register([csharp, conflicting])).toThrow(
      'Language name "cs" is already registered',
    );
    expect(aura.has("csharp")).toBe(false);
    expect(aura.has("custom")).toBe(false);
  });

  test("renders escaped HTML", () => {
    const aura = new Aura().register([csharp]);
    expect(aura.highlight('string text = "<tag>";', "csharp")).toBe(
      '<span class="aura-type">string</span> text <span class="aura-operator">=</span> <span class="aura-string">&quot;&lt;tag&gt;&quot;</span><span class="aura-punctuation">;</span>',
    );
  });

  test("enforces the streaming lifecycle", () => {
    const stream = new Aura().register([csharp]).createHighlighter("cs");
    stream.finish();
    expect(() => stream.write("public")).toThrow(
      "Cannot write after the highlighter has finished",
    );
    expect(() => stream.finish()).toThrow(
      "The highlighter has already finished",
    );
  });
});

describe("C# plugin", () => {
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
}`;

  test("classifies representative C# syntax", () => {
    const segments = tokenize([source]);
    expect(findScopes(segments, "public")).toEqual([
      "keyword",
      "keyword",
      "keyword",
      "keyword",
      "keyword",
      "keyword",
      "keyword",
    ]);
    expect(findScopes(segments, "string")).toEqual([
      "type",
      "type",
      "type",
      "type",
      "type",
    ]);
    expect(findScopes(segments, "true")).toEqual(["literal"]);
    expect(findScopes(segments, "#nullable enable")).toEqual(["meta"]);
    expect(findScopes(segments, "// LLM output may split anywhere")).toEqual([
      "comment",
    ]);
    expect(findScopes(segments, "/* done */")).toEqual(["comment"]);
  });

  test("keeps tokenization stable across arbitrary stream boundaries", () => {
    const expected = tokenize([source]);

    for (let split = 0; split <= source.length; split++) {
      expect(tokenize([source.slice(0, split), source.slice(split)])).toEqual(
        expected,
      );
    }

    expect(tokenize([...source])).toEqual(expected);
  });

  test("flushes an incomplete final token", () => {
    expect(tokenize(["pub", "lic"])).toEqual([
      { text: "public", scope: "keyword" },
    ]);
    expect(tokenize(["identifier"])).toEqual([{ text: "identifier" }]);
  });
});

function tokenize(chunks: string[]): Segment[] {
  const lexer = new Aura().register([csharp]).createLexer("csharp");
  const segments: Segment[] = [];
  const emit = (text: string, scope?: TokenScope) => append(segments, text, scope);

  for (const chunk of chunks) lexer.write(chunk, emit);
  lexer.finish(emit);
  return segments;
}

function append(segments: Segment[], text: string, scope?: TokenScope): void {
  if (text.length === 0) return;
  const previous = segments.at(-1);
  if (previous && previous.scope === scope) {
    previous.text += text;
    return;
  }
  segments.push(scope ? { text, scope } : { text });
}

function findScopes(segments: Segment[], text: string): Array<TokenScope | undefined> {
  return segments.filter((segment) => segment.text === text).map((segment) => segment.scope);
}
