# aura

Browser syntax highlighting for streaming code.

## Install

```sh
npm install @realloon/aura
```

## Usage

```ts
import '@realloon/aura/highlight.css'
import { Aura, csharp } from '@realloon/aura'

const aura = new Aura().register([csharp])
const code = document.querySelector('pre code')!
const stream = aura.highlight(code, 'csharp')

stream.write('public sealed cla')
stream.write('ss Example {}')
stream.end()
```

Call `stream.dispose()` before removing the code element.
