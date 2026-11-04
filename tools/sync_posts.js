#!/usr/bin/env node
/**
 * 从 wechat-studio 同步文章到博客
 *
 * 用法：
 *   node tools/sync_posts.js            # 同步全部
 *   node tools/sync_posts.js slug ...   # 只同步指定文章
 *   node tools/sync_posts.js --check    # 只报告差异，不写文件
 *
 * 幂等：目标文件内容一致则跳过，不重写、不改 mtime。
 * 不删除：源端删掉文章后，博客里的旧目录会保留，只在报告里提示。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BLOG = path.resolve(__dirname, '..')
const SRC = path.resolve(BLOG, '..', 'wechat-studio', 'posts')
const DEST = path.join(BLOG, 'docs', 'posts')
const IMG_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif'])

/** 每篇文章的博客侧配置。没列出的走默认值。 */
const CONFIG = {
  'cheap-model-fit': { tags: ['模型选型', 'Agent'] },
  'inflation-of-effort': { tags: ['职业', '观点'] },
  'ai-desktop-pet': { tags: ['Agent', '产品'] },
}

const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
const only = args.filter((a) => !a.startsWith('-'))

const stat = { written: 0, skipped: 0, images: 0, removed: [] }

function yamlStr(v) {
  if (v === undefined || v === null) return '""'
  return '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}

function splitFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return { fm: {}, body: md }
  const fm = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
    if (!kv) continue
    let val = kv[2].trim()
    if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1)
    fm[kv[1]] = val
  }
  return { fm, body: md.slice(m[0].length) }
}

/** 相对图片路径补 ./，绝对路径和远程图不动 */
function normalizeImages(body) {
  return body.replace(/!\[([^\]]*)\]\((?!https?:|data:|\/|\.\/)([^)\s]+)\)/g, '![$1](./$2)')
}

function sameContent(a, b) {
  if (!fs.existsSync(b)) return false
  return fs.readFileSync(a).equals(fs.readFileSync(b))
}

function syncImages(srcDir, destDir) {
  const src = path.join(srcDir, 'imgs')
  if (!fs.existsSync(src)) return
  for (const name of fs.readdirSync(src)) {
    const ext = path.extname(name).toLowerCase()
    if (!IMG_EXT.has(ext)) continue
    const from = path.join(src, name)
    if (!fs.statSync(from).isFile()) continue
    const to = path.join(destDir, 'imgs', name)
    if (sameContent(from, to)) continue
    if (checkOnly) {
      console.log('   Δ 图', name)
      stat.images++
      continue
    }
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.copyFileSync(from, to)
    console.log('   + 图', name)
    stat.images++
  }
}

function syncOne(slug) {
  const srcDir = path.join(SRC, slug)
  const mdPath = path.join(srcDir, 'article.md')
  if (!fs.existsSync(mdPath)) {
    console.log(`✗ ${slug}：源文件不存在`)
    return
  }

  let meta = {}
  const metaPath = path.join(srcDir, 'meta.json')
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    } catch {
      console.log(`   ⚠ ${slug}：meta.json 解析失败，日期回退到文件修改时间`)
    }
  }

  const cfg = CONFIG[slug] || {}
  const { fm, body } = splitFrontmatter(fs.readFileSync(mdPath, 'utf8'))
  if (!fm.title) {
    console.log(`✗ ${slug}：缺少 title，跳过`)
    return
  }

  const date = String(meta.created || fm.date || fs.statSync(mdPath).mtime.toISOString().slice(0, 10)).slice(0, 10)
  const tags = cfg.tags || []
  const author = fm.author || meta.author || 'Leo'

  const out = [
    '---',
    `title: ${yamlStr(fm.title)}`,
    `description: ${yamlStr(fm.description || '')}`,
    `date: ${yamlStr(date)}`,
    tags.length ? `tags:\n${tags.map((t) => `  - ${yamlStr(t)}`).join('\n')}` : 'tags: []',
    `author: ${yamlStr(author)}`,
    '---',
    '',
    normalizeImages(body).replace(/^\s*\n/, '').trimEnd(),
    '',
  ].join('\n')

  const destDir = path.join(DEST, slug)
  const destFile = path.join(destDir, 'index.md')

  if (fs.existsSync(destFile) && fs.readFileSync(destFile, 'utf8') === out) {
    console.log(`= ${slug}：无变化`)
    stat.skipped++
  } else if (checkOnly) {
    console.log(`Δ ${slug}：内容有差异`)
    stat.written++
  } else {
    fs.mkdirSync(destDir, { recursive: true })
    fs.writeFileSync(destFile, out, 'utf8')
    console.log(`✓ ${slug}：已写入 docs/posts/${slug}/index.md`)
    stat.written++
  }

  syncImages(srcDir, destDir)
}

// --- 主流程 ---
if (!fs.existsSync(SRC)) {
  console.error('找不到源目录：', SRC)
  process.exit(1)
}

const all = fs
  .readdirSync(SRC)
  .filter((d) => fs.existsSync(path.join(SRC, d, 'article.md')))
  .sort()

const targets = only.length ? only : all

console.log(`源目录 ${all.length} 篇，本次处理 ${targets.length} 篇${checkOnly ? '（仅检查）' : ''}\n`)
for (const slug of targets) syncOne(slug)

// 孤儿检查：博客里有、源里已经没有
const orphans = fs
  .readdirSync(DEST)
  .filter((d) => fs.statSync(path.join(DEST, d)).isDirectory() && !all.includes(d))

console.log(
  `\n写入 ${stat.written} · 跳过 ${stat.skipped} · 图片 ${stat.images} 张${checkOnly ? '（未落盘）' : ''}`
)
if (orphans.length) {
  console.log(`\n⚠ 这些目录在源仓库已不存在，脚本不会自动删除：`)
  orphans.forEach((d) => console.log('   docs/posts/' + d))
  console.log('   确认要删的话，手动删除后再 commit。')
}
