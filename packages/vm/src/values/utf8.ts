/** Cut `text` to at most `max` UTF-8 bytes without splitting a character. */
export function truncateUtf8(text: string, max: number): string {
  let bytes = 0
  let end = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4
    if (bytes > max) break
    end += ch.length
  }
  return text.slice(0, end)
}
