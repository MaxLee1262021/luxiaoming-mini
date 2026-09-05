const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const miniprogramRoot = path.join(root, 'miniprogram')
const pagesRoot = path.join(miniprogramRoot, 'pages')
const appJsonPath = path.join(miniprogramRoot, 'app.json')

const requiredDirs = ['api', 'service', 'utils', 'store', 'components', 'pages']
const sourceExts = new Set(['.js', '.json', '.wxml', '.wxss', '.wxs'])
const forbiddenPagePatterns = [
  { name: 'wx.request', pattern: /\bwx\.request\s*\(/ },
  { name: 'wx.cloud.database', pattern: /\bwx\.cloud\.database\s*\(/ },
  { name: 'database.collection', pattern: /\.collection\s*\(/ }
]
const forbiddenSourcePatterns = [
  { name: 'console.log', pattern: /\bconsole\.log\s*\(/ },
  { name: 'TODO/FIXME', pattern: /\b(?:TODO|FIXME)\b/i },
  { name: 'garbled replacement char', pattern: /�/ },
  { name: 'common mojibake', pattern: /锟|鈥|鐨|涓|楣|棣|鍛|鐓|鐭|鎴|馃|鈻|閺|闁/ },
  { name: 'old empty placeholder class', pattern: /empty-placeholder|empty-card|gallery-card|product-video-card/ }
]
const maxRegisteredPageJsLines = 300
const maxWxssLines = 900

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  fs.readdirSync(dir).forEach(name => {
    const filePath = path.join(dir, name)
    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) walk(filePath, out)
    else out.push(filePath)
  })
  return out
}

function sourceFiles() {
  return walk(miniprogramRoot).filter(filePath => sourceExts.has(path.extname(filePath)))
}

function pageJsFiles() {
  return walk(pagesRoot).filter(filePath => filePath.endsWith('.js'))
}

function countLines(text) {
  return text.split(/\r?\n/).length
}

function toRelative(filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/')
}

function loadJson(filePath, errors) {
  try {
    return JSON.parse(readText(filePath))
  } catch (err) {
    errors.push(`${toRelative(filePath)} is invalid JSON: ${err.message}`)
    return {}
  }
}

function hasBom(filePath) {
  const buf = fs.readFileSync(filePath)
  return buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf
}

function checkRequiredDirs(errors) {
  requiredDirs.forEach(dir => {
    const fullPath = path.join(miniprogramRoot, dir)
    if (!fs.existsSync(fullPath)) errors.push(`Missing required directory: miniprogram/${dir}`)
  })
}

function checkSyntax(files, errors) {
  files.forEach(filePath => {
    if (hasBom(filePath)) errors.push(`${toRelative(filePath)} contains UTF-8 BOM`)
    if (filePath.endsWith('.json')) loadJson(filePath, errors)
    if (filePath.endsWith('.js')) {
      try {
        new Function(readText(filePath))
      } catch (err) {
        errors.push(`${toRelative(filePath)} has JS syntax error: ${err.message}`)
      }
    }
  })
}

function checkForbiddenPatterns(files, errors) {
  files.forEach(filePath => {
    const text = readText(filePath)
    forbiddenSourcePatterns.forEach(rule => {
      if (rule.pattern.test(text)) errors.push(`${toRelative(filePath)} contains forbidden pattern: ${rule.name}`)
    })
  })
}

function checkPageApis(errors, warnings, registeredPages) {
  pageJsFiles().forEach(filePath => {
    const text = readText(filePath)
    forbiddenPagePatterns.forEach(rule => {
      if (rule.pattern.test(text)) errors.push(`${toRelative(filePath)} uses forbidden page-side API: ${rule.name}`)
    })

    const pagePath = toRelative(filePath).replace(/^miniprogram\//, '').replace(/\.js$/, '')
    const lines = countLines(text)
    if (registeredPages.has(pagePath) && lines > maxRegisteredPageJsLines) {
      warnings.push(`${toRelative(filePath)} has ${lines} lines; move complex logic into service/components`)
    }
  })
}

function checkAppPages(errors) {
  const appJson = loadJson(appJsonPath, errors)
  const registeredPages = new Set(appJson.pages || [])

  registeredPages.forEach(page => {
    ;['.js', '.json', '.wxml', '.wxss'].forEach(ext => {
      const filePath = path.join(miniprogramRoot, page + ext)
      if (!fs.existsSync(filePath)) errors.push(`Registered page missing file: miniprogram/${page}${ext}`)
    })
  })

  const pageDirs = pageJsFiles()
    .map(filePath => toRelative(filePath).replace(/^miniprogram\//, '').replace(/\.js$/, ''))
    .filter(page => !registeredPages.has(page))
  if (pageDirs.length) {
    errors.push(`Unregistered page JS files: ${pageDirs.join(', ')}`)
  }

  return registeredPages
}

function checkComponentRefs(files, errors) {
  files.filter(filePath => filePath.endsWith('.json')).forEach(filePath => {
    const json = loadJson(filePath, errors)
    Object.entries(json.usingComponents || {}).forEach(([name, rel]) => {
      if (!rel.startsWith('/')) return
      const componentBase = path.join(miniprogramRoot, rel.slice(1))
      ;['.js', '.json', '.wxml', '.wxss'].forEach(ext => {
        if (!fs.existsSync(componentBase + ext)) {
          errors.push(`${toRelative(filePath)} references missing component ${name}: ${rel}${ext}`)
        }
      })
    })
  })
}

function checkFileSize(files, warnings) {
  files.forEach(filePath => {
    const lines = countLines(readText(filePath))
    if (filePath.endsWith('.wxss') && lines > maxWxssLines) {
      warnings.push(`${toRelative(filePath)} has ${lines} lines; consider extracting shared styles/components`)
    }
  })
}

function main() {
  const errors = []
  const warnings = []
  const files = sourceFiles()

  checkRequiredDirs(errors)
  checkSyntax(files, errors)
  const registeredPages = checkAppPages(errors)
  checkComponentRefs(files, errors)
  checkPageApis(errors, warnings, registeredPages)
  checkForbiddenPatterns(files, errors)
  checkFileSize(files, warnings)

  if (warnings.length) {
    console.warn('\nArchitecture warnings:')
    warnings.forEach(item => console.warn(`- ${item}`))
  }

  if (errors.length) {
    console.error('\nArchitecture errors:')
    errors.forEach(item => console.error(`- ${item}`))
    process.exit(1)
  }

  console.log('Mini program architecture check passed')
}

main()
