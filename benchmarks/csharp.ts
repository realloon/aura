import { Aura, csharp } from '../src/main'

const sample = `
public sealed class MessageService
{
    public async Task<string> RenderAsync(string name, int count)
    {
        // Representative LLM-generated C#
        await Task.Delay(1);
        return $"Hello, {name}: {count + 1}";
    }
}
`

const source = sample.repeat(2_000)
const aura = new Aura().register([csharp])
const iterations = 20

for (let warmup = 0; warmup < 5; warmup++) {
  aura.highlight(source, 'csharp')
}

const start = performance.now()

for (let iteration = 0; iteration < iterations; iteration++) {
  const stream = aura.createHighlighter('csharp')
  for (let offset = 0; offset < source.length; offset += 32) {
    stream.write(source.slice(offset, offset + 32))
  }
  stream.finish()
}

const seconds = (performance.now() - start) / 1_000
const megabytes = (source.length * iterations) / 1_000_000

console.log(`${(megabytes / seconds).toFixed(1)} MiB/s (${seconds.toFixed(2)}s)`)
