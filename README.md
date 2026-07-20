# aura

A syntax-highlighting library for streaming output.

## Install

```sh
npm install @realloon/aura
```

## Usage

```ts
import { Aura, csharp } from '@realloon/aura'

const aura = new Aura().register([csharp])
const stream = aura.createHighlighter('csharp')

html += stream.write('public sealed cla')
html += stream.write('ss Example {}')
html += stream.finish()
```

If the UI does not need HTML, use the language lexer directly to avoid token objects and HTML strings:

```ts
const lexer = aura.createLexer('cs')
lexer.write(chunk, (text, scope) => renderToken(text, scope))
lexer.finish((text, scope) => renderToken(text, scope))
```

## Use with Markflow

Aura can be passed to [Markflow](https://github.com/realloon/markflow) to highlight fenced code blocks while Markdown is streaming:

```ts
import { Aura, csharp } from '@realloon/aura'
import { MarkdownStream } from '@realloon/markflow'

const aura = new Aura().register([csharp])
const stream = new MarkdownStream({ highlighter: aura })
```
