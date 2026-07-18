# aura

A syntax-highlighting library for streaming output.

```ts
import { Aura, csharp } from "aura";

const aura = new Aura().register(csharp);
const stream = aura.createHighlighter("csharp");

html += stream.write("public sealed cla");
html += stream.write("ss Example {}");
html += stream.finish();
```

If the UI does not need HTML, use the language lexer directly to avoid token objects and HTML strings:

```ts
const lexer = aura.createLexer("cs");
lexer.write(chunk, (text, scope) => renderToken(text, scope));
lexer.finish((text, scope) => renderToken(text, scope));
```

HTML class names use the `aura-*` prefix.
