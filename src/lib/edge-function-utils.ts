export interface ParsedParam {
  name: string
  type: string
  required: boolean
  description: string
}

export interface ParsedSchema {
  description: string
  params: ParsedParam[]
}

// Supported annotation formats (all case-insensitive for type/required tokens):
//
//   @description Some free text
//   @param userId string required - The user's UUID
//   @param channel string optional - Channel name (default: push)
//   @param amount? number - Optional amount          ← trailing ? means optional
//
// Params without required/optional token default to required.
export function parseFunctionNotes(notes: string): ParsedSchema {
  const lines = notes.split('\n')
  let description = ''
  const params: ParsedParam[] = []

  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('//')) continue

    if (line.startsWith('@description')) {
      description = line.replace(/^@description\s*/, '').trim()
      continue
    }

    if (line.startsWith('@param')) {
      // Strip the @param token and optional leading/trailing braces e.g. @param {string} name
      const rest = line.replace(/^@param\s*/, '').replace(/^\{[^}]*\}\s*/, '')
      // rest is now: "name type required/optional - description"
      // or: "name?: type - description" (TypeDoc style)
      // or: "name - description"
      const dashIdx = rest.indexOf(' - ')
      const beforeDash = dashIdx >= 0 ? rest.slice(0, dashIdx).trim() : rest.trim()
      const afterDash = dashIdx >= 0 ? rest.slice(dashIdx + 3).trim() : ''

      const tokens = beforeDash.split(/\s+/)
      if (!tokens[0]) continue

      let rawName = tokens[0]
      const isOptionalMarker = rawName.endsWith('?')
      rawName = rawName.replace(/\?$/, '')

      const type = tokens[1] ?? 'any'
      const reqToken = tokens[2]?.toLowerCase()
      let required = !isOptionalMarker
      if (reqToken === 'optional') required = false
      if (reqToken === 'required') required = true

      params.push({ name: rawName, type, required, description: afterDash })
    }
  }

  return { description, params }
}

// Generate a JSON body template from parsed params, using sensible placeholder values.
export function generateBodyFromSchema(params: ParsedParam[]): string {
  if (params.length === 0) return ''
  const obj: Record<string, unknown> = {}
  for (const p of params) {
    switch (p.type.toLowerCase()) {
      case 'string':
        obj[p.name] = ''
        break
      case 'number':
      case 'integer':
      case 'int':
      case 'float':
        obj[p.name] = 0
        break
      case 'boolean':
      case 'bool':
        obj[p.name] = false
        break
      case 'array':
        obj[p.name] = []
        break
      case 'object':
        obj[p.name] = {}
        break
      default:
        obj[p.name] = null
    }
  }
  return JSON.stringify(obj, null, 2)
}

// Extract the leading documentation comment block from edge function source.
// Walks the source line-by-line, picking up consecutive lines that are either
// a `//` line-comment, a `/* … */` block-comment, blank, or an `import …`
// statement (so the block can be split across `import` boundaries). Stops at
// the first line of executable code. Strips comment prefixes (`//`, `/*`, `*`,
// `*/`) so the result is plain text ready for parseFunctionNotes().
//
// Returns the extracted text only if it contains at least one `@description`
// or `@param` marker — otherwise returns '' so the UI can fall back to the
// empty-state prompt. This silently handles binary eszip bundles too: they
// won't contain those markers in scannable text.
export function extractCommentFrontmatter(source: string): string {
  if (!source || typeof source !== 'string') return ''

  // Bail early on obvious binary payloads (eszip bundles, etc.)
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0e-\x1f]/.test(source.slice(0, 2000))) return ''

  const lines = source.split('\n')
  const collected: string[] = []
  let inBlockComment = false

  for (const raw of lines) {
    const line = raw.trim()

    // Continue a multi-line /* … */ block
    if (inBlockComment) {
      const endIdx = line.indexOf('*/')
      if (endIdx >= 0) {
        collected.push(line.slice(0, endIdx).replace(/^\*\s?/, '').trim())
        inBlockComment = false
        continue
      }
      collected.push(line.replace(/^\*\s?/, '').trim())
      continue
    }

    // Blank line — keep walking; the leading block may use blanks as separators.
    if (line === '') {
      collected.push('')
      continue
    }

    // `// …` line comment
    if (line.startsWith('//')) {
      collected.push(line.slice(2).replace(/^\s/, ''))
      continue
    }

    // `/* …` block comment (single-line or start of multi-line)
    if (line.startsWith('/*')) {
      const stripped = line.slice(2)
      const endIdx = stripped.indexOf('*/')
      if (endIdx >= 0) {
        collected.push(stripped.slice(0, endIdx).replace(/^\*\s?/, '').trim())
      } else {
        collected.push(stripped.replace(/^\*\s?/, '').trim())
        inBlockComment = true
      }
      continue
    }

    // `import …` / `export …` lines don't terminate the leading block —
    // the frontmatter can sit above or between top-level statements.
    if (/^(import|export)\s/.test(line)) continue

    // Any other top-level code terminates the leading block.
    break
  }

  const text = collected.join('\n').trim()
  if (!/@description|@param/.test(text)) return ''
  return text
}

