import { Aura, csharp } from 'aura'

const aura = new Aura().register([csharp])
const stream = aura.createHighlighter('csharp')

console.log(stream.write('public sealed cla'))
console.log(stream.write('ss Example {}'))
console.log(stream.finish())
