import { expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function walkDir(dir: string, fileList: string[] = []): string[] {
  const files = readdirSync(dir)
  for (const file of files) {
    const filePath = join(dir, file)
    const stat = statSync(filePath)
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== '.next') {
        walkDir(filePath, fileList)
      }
    } else if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.css')) {
      fileList.push(filePath)
    }
  }
  return fileList
}

it('ensures no logical margin/padding utilities (ml-, mr-, pl-, pr-) are used in src/', () => {
  const srcFiles = walkDir('src')
  const rtlRegex = /\b(ml|mr|pl|pr)-/

  const violations: string[] = []

  for (const file of srcFiles) {
    const content = readFileSync(file, 'utf8')
    const lines = content.split('\n')
    lines.forEach((line, index) => {
      if (rtlRegex.test(line)) {
        violations.push(`${file}:${index + 1}: ${line.trim()}`)
      }
    })
  }

  expect(
    violations,
    `Found physical padding/margin utilities which violate RTL rules:\n${violations.join('\n')}`,
  ).toHaveLength(0)
})
