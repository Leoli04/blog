#!/usr/bin/env node
/**
 * 往「待消化」清单里加一条，或者改一条已有条目。
 *
 *   node tools/add_pending.js <url> "为什么值得读" [选项]
 *
 * 选项
 *   --title=标题        不给就自动抓网页 <title>
 *   --source=出处       不给就自动抓 og:site_name，再不行用域名
 *   --tags=Agent,编排   逗号分隔
 *   --status=todo       取值 todo / reading / done，默认 todo
 *   --digest=/notes/xx/ 消化完写的笔记，站内相对路径
 *
 * 同一个 url 再跑一次就是「改」，不会产生重复条目。
 * 字段没变化时不写盘，mtime 不动。
 *
 * 注意：仓库 package.json 是 "type": "module"，本文件按 ESM 写。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FILE = path.join(HERE, '..', 'docs', 'pending', 'items.json')
const STATUS = ['todo', 'reading', 'done']

function die(msg) {
  console.error('✖ ' + msg)
  process.exit(1)
}

function today() {
  // 固定按东八区算，避免机器时区不同导致日期差一天
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
}

function decode(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

async function fetchMeta(url) {
  const out = { title: '', source: '' }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 9000)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      },
    })
    if (!res.ok) return out
    const html = await res.text()
    const pick = (re) => {
      const m = html.match(re)
      return m ? m[1].trim() : ''
    }
    out.title =
      pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
      pick(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i) ||
      pick(/<title[^>]*>([\s\S]*?)<\/title>/i)
    out.source =
      pick(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i) ||
      pick(/<meta[^>]+name=["']application-name["'][^>]+content=["']([^"']+)["']/i)
    out.title = decode(out.title)
    out.source = decode(out.source)
  } catch {
    // 抓不到就让调用方兜底，不阻断
  } finally {
    clearTimeout(timer)
  }
  return out
}

function parseArgs(argv) {
  const pos = []
  const opt = {}
  for (const a of argv) {
    if (a.startsWith('--')) {
      const i = a.indexOf('=')
      if (i === -1) opt[a.slice(2)] = true
      else opt[a.slice(2, i)] = a.slice(i + 1)
    } else {
      pos.push(a)
    }
  }
  return { pos, opt }
}

async function main() {
  const { pos, opt } = parseArgs(process.argv.slice(2))
  const url = (pos[0] || '').trim()
  const why = (pos[1] || '').trim()

  if (!url) {
    console.log(
      '用法: node tools/add_pending.js <url> "为什么值得读" [--title=] [--source=] [--tags=a,b] [--status=todo] [--digest=/notes/xx/]'
    )
    process.exit(0)
  }
  if (!/^https?:\/\//.test(url)) die('url 必须带 http(s):// 前缀')

  const status = opt.status || ''
  if (status && !STATUS.includes(status)) die(`status 只能是 ${STATUS.join(' / ')}`)

  let list = []
  if (fs.existsSync(FILE)) {
    try {
      list = JSON.parse(fs.readFileSync(FILE, 'utf8'))
      if (!Array.isArray(list)) throw new Error('顶层不是数组')
    } catch (e) {
      die(`读取 ${path.relative(process.cwd(), FILE)} 失败: ${e.message}`)
    }
  }

  const idx = list.findIndex((x) => x && x.url === url)
  const existed = idx !== -1

  // 只在新建、且没给 title/source 时才去抓网页
  let meta = { title: '', source: '' }
  if (!existed && (!opt.title || !opt.source)) {
    meta = await fetchMeta(url)
  }

  const patch = {}
  if (opt.title) patch.title = opt.title
  else if (!existed) patch.title = meta.title || hostOf(url)
  if (opt.source) patch.source = opt.source
  else if (!existed) patch.source = meta.source || hostOf(url)
  if (why) patch.why = why
  if (opt.tags) patch.tags = String(opt.tags).split(/[,，]/).map((s) => s.trim()).filter(Boolean)
  if (status) patch.status = status
  if (opt.digest) patch.digest = opt.digest
  if (!existed) {
    patch.url = url
    patch.added = opt.added || today()
  }

  let entry
  if (existed) {
    entry = { ...list[idx] }
    for (const [k, v] of Object.entries(patch)) {
      if (entry[k] !== v) entry[k] = v
    }
  } else {
    entry = {
      title: patch.title || '',
      url,
      source: patch.source || '',
      added: patch.added,
      status: patch.status || 'todo',
      why: patch.why || '',
      tags: patch.tags || [],
      digest: patch.digest || '',
    }
  }

  // 补默认值，保证结构稳定
  entry.status = entry.status || 'todo'
  entry.tags = entry.tags || []
  entry.digest = entry.digest || ''

  if (existed && JSON.stringify(entry) === JSON.stringify(list[idx])) {
    console.log('· 没有变化，未写盘：' + entry.title)
    return
  }

  if (!entry.why && !existed) {
    console.log('⚠ 没写「为什么值得读」。只存链接的清单，三个月后就没人看第二眼。')
  }

  if (existed) list[idx] = entry
  else list.push(entry)

  fs.writeFileSync(FILE, JSON.stringify(list, null, 2) + '\n', 'utf8')

  const pending = list.filter((x) => x && (x.status || 'todo') !== 'done').length
  console.log(`${existed ? '✎ 已更新' : '✚ 已加入'}: ${entry.title}`)
  console.log(`  ${entry.source} · ${entry.added} · ${entry.status}`)
  console.log(`  当前还有 ${pending} 篇没消化（共 ${list.length} 条）`)
}

main().catch((e) => die(e.stack || e.message))
