export function createAsciiTable(characters: string) {
  const table = new Uint8Array(128)
  for (let index = 0; index < characters.length; index++) {
    table[characters.charCodeAt(index)] = 1
  }
  return table
}

export function createWordSet(words: string) {
  return new Set(words.trim().split(/\s+/))
}

export function isAsciiDigit(code: number) {
  return code >= 48 && code <= 57
}

export function isAsciiLetter(code: number) {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
}

export function isIdentifierStart(code: number) {
  return code === 95 || isAsciiLetter(code) || code > 127
}

export function isIdentifierPart(code: number) {
  return isIdentifierStart(code) || isAsciiDigit(code)
}

export function isWhitespace(code: number) {
  return code === 9 || code === 10 || code === 13 || code === 32
}

export function scanWhitespace(input: string, index: number) {
  let end = index + 1
  while (end < input.length && isWhitespace(input.charCodeAt(end))) end++
  return end
}
