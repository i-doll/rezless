import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const read = (p: string) => readFileSync(root + p, 'utf8')
const packages = readdirSync(root + 'packages').filter((d) =>
  existsSync(`${root}packages/${d}/package.json`),
)

describe('licence files in the published packages', () => {
  it.each(packages)('%s ships LICENSE and the current NOTICE', (dir) => {
    const { files } = JSON.parse(read(`packages/${dir}/package.json`))
    expect(files).toEqual(expect.arrayContaining(['LICENSE', 'NOTICE']))
    expect(read(`packages/${dir}/LICENSE`)).toBe(read('LICENSE'))
    expect(read(`packages/${dir}/NOTICE`)).toBe(read('NOTICE'))
  })

  it('licenses rezless under the MIT License', () => {
    expect(read('LICENSE').replace(/\s+/g, ' ').trim()).toBe(
      'MIT License Copyright (c) 2026 The rezless contributors ' +
        'Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: ' +
        'The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. ' +
        'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.',
    )
    expect(read('NOTICE')).toContain('This product is licensed under the MIT License (see LICENSE).')
  })

  it.each([
    ['package.json', 'MIT'],
    ['packages/parser/package.json', 'MIT'],
    ['packages/vitest/package.json', 'MIT'],
    ['packages/vm/package.json', 'MIT AND Apache-2.0 AND LGPL-2.0-only'],
  ])('%s declares the licence %s', (file, license) => {
    expect(JSON.parse(read(file)).license).toBe(license)
  })

  it('checks the licence field of every package', () => {
    expect([...packages].sort()).toEqual(['parser', 'vitest', 'vm'])
  })

  it('ships the third-party licence texts next to slua.wasm', () => {
    const { files } = JSON.parse(read('packages/vm/package.json'))
    expect(files).toContain('wasm')
    expect(existsSync(root + 'packages/vm/wasm/THIRD-PARTY-LICENSES.txt')).toBe(true)
    expect(read('NOTICE')).toContain('packages/vm/wasm/THIRD-PARTY-LICENSES.txt')
  })
})

describe('third-party notices for slua.wasm', () => {
  const notice = read('NOTICE')
  const texts = read('packages/vm/wasm/THIRD-PARTY-LICENSES.txt')

  // The component list was read from the SLua sources at one commit. Moving
  // the pin means reading them again.
  it('name the SLua commit the build script pins', () => {
    const pin = /SLUA_COMMIT:-([0-9a-f]{40})\}/.exec(read('scripts/build-slua-wasm.sh'))?.[1]
    expect(pin).toBeDefined()
    expect(notice).toContain(pin)
    expect(texts).toContain(pin)
  })

  it('name the SLua tag and Emscripten version the build script records', () => {
    const script = read('scripts/build-slua-wasm.sh')
    const tag = /SLUA_COMMIT=.*# (v[\d.]+)/.exec(script)?.[1]
    const emscripten = /built with (Emscripten [\d.]+)\./.exec(script)?.[1]
    expect(tag).toBeDefined()
    expect(emscripten).toBeDefined()
    for (const text of [notice, texts]) {
      expect(text).toContain(`tag ${tag}`)
      expect(text).toContain(emscripten)
    }
  })

  it.each([
    'Copyright (c) 2025 Linden Lab',
    'Copyright (c) 2019-2025 Roblox Corporation',
    'Copyright (c) 1994–2019 Lua.org, PUC-Rio.',
    'Copyright (c) 2022 by Harold Cindy',
    'Copyright (c) 2013-2015 by Florian Nuecke.',
    'Copyright (c) 2010-2012  Mark Pulford <mark@kyne.com.au>',
    'Copyright (c) 2007-2010 Michael G Schwern',
    'Copyright (C) 2004 Novell, Inc (http://www.novell.com)',
    'Copyright (C) 2008 Mainsoft Co. (http://www.mainsoft.com)',
    'Copyright (C) 2024 Harold Cindy',
    'Copyright © 1991-2017 Unicode, Inc. All rights reserved.',
    'Copyright (c) 2010-2014 Emscripten authors, see AUTHORS file.',
    'Copyright © 2005-2020 Rich Felker, et al.',
  ])('carry the notice "%s"', (line) => {
    expect(notice).toContain(line)
    expect(texts).toContain(line)
  })

  it('put the Mono case tables under the LGPL v2 and ship its text and their source', () => {
    const { files } = JSON.parse(read('packages/vm/package.json'))
    expect(files).toContain('src/values/mono-case.ts')
    const header = read('packages/vm/src/values/mono-case.ts').split('/**')[0]!
    for (const text of [notice, texts, header]) {
      expect(text.replace(/(\n\/\/)?\s+/g, ' ')).toContain(
        'GNU Library General Public License, version 2',
      )
    }
    expect(header).toMatch(/Changed from the original on \d{4}-\d{2}-\d{2}/)
    expect(header).toContain('wasm/THIRD-PARTY-LICENSES.txt')
    expect(notice).toContain('Copyright 2001-2003 Ximian, Inc (http://www.ximian.com)')
    expect(notice).toContain('Copyright 2004-2009 Novell, Inc (http://www.novell.com)')
    expect(texts).toContain('GNU LIBRARY GENERAL PUBLIC LICENSE\n')
    expect(texts).toContain('Version 2, June 1991')
    expect(texts).toContain('END OF TERMS AND CONDITIONS')
    expect(texts).toContain('16. IN NO EVENT UNLESS REQUIRED BY APPLICABLE LAW')
  })

  it('ship the Apache License text for the APR routines', () => {
    const apr = texts.slice(texts.indexOf('4. Apache Portable Runtime'), texts.indexOf('5. y2038'))
    expect(apr).toContain('Apache License\n                           Version 2.0, January 2004')
    expect(apr).toContain('TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION')
    expect(apr).toContain('END OF TERMS AND CONDITIONS')
    expect(apr).toContain('APPENDIX: How to apply the Apache License to your work.')
  })

  it('reproduce the APR attribution notices in NOTICE', () => {
    const flat = notice.replace(/\s+/g, ' ')
    expect(flat).toContain(
      'This product includes software developed at The Apache Software Foundation (http://www.apache.org/).',
    )
    expect(flat).toContain(
      'Portions of this software were developed at the National Center for Supercomputing Applications (NCSA)',
    )
  })
})
