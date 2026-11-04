#!/usr/bin/env node
/**
 * 博客三份清单的统一入口：待看文章 / 待出稿 / 收藏。
 *
 *   node tools/lists.js read <url> "为什么值得看" [选项]
 *   node tools/lists.js content "选题" "想说什么" [选项]
 *   node tools/lists.js pick <url> "为什么值得反复看" [选项]
 *
 * 选项
 *   --title=标题        不给就自动抓网页 <title>
 *   --source=出处       不给就自动抓 og:site_name，再不行用域名
 *   --tags=Agent,上下文 逗号分隔
 *   --status=xxx        read: todo|reading|done   content: idea|drafting|done
 *   --digest=notes/xx/ read 专用，读完写的笔记（站内路径）
 *   --draft=posts/xx/  content 专用，稿子在哪（站内路径）
 *   --added=2026-11-04  覆盖加入日期，默认今天（东八区）
 *
 * 同一个 url（content 是同一个标题）再跑一次是「改」不是「加」。
 * 字段没变化时不写盘，mtime 不动。
 *
 * 注意：仓库 package.json 是 "type": "module"，本文件按 ESM 写。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, '..')

const LISTS = {
  read: {
    label: '待看文章',
    rel: 'docs/todo/read.json',
    key: 'url',
    statuses: ['todo', 'reading', 'done'],
    defaultStatus: 'todo',
    extra: 'digest',
    fetch: true,
    needUrl: true,
  },
  content: {
    label: '待出稿',
    rel: 'docs/todo/content.json',
    key: 'title',
    statuses: ['idea', 'drafting', 'done'],
    defaultStatus: 'idea',
    extra: 'draft',
    fetch: false,
    needUrl: false,
  },
  pick: {
    label: '收藏',
    rel: 'docs/picks/items.json',
    key: 'url',
    statuses: [],
    defaultStatus: 'pick',
    extra: '',
    fetch: true,
    needUrl: true,
  },
}

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

/**
 * 站内路径统一成 /xxx/ 形式。
 * Git Bash 会把 `/notes/x/` 自动转成 `C:/.../notes/x/`（MSYS 路径转换），
 * 写进 JSON 就是一条坏链接。所以只接受不带前导斜杠的写法：notes/x/
 */
function sitePath(v) {
  let s = String(v || '').trim()
  if (!s) return ''
  if (/^https?:\/\//.test(s)) return s
  if (/^[a-zA-Z]:[\\/]/.test(s) || s.startsWith('\\\\')) {
    die(
      `站内路径不要带盘符或前导斜杠（Git Bash 会把它转成 Windows 路径）。` +
        `写成 ${s.split(/[\\/]/).filter(Boolean).slice(-2).join('/')} 这种形式`
    )
  }
  s = s.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  return s ? '/' + s + '/' : ''
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

function usage() {
  console.log(`用法:
  node tools/lists.js read <url> "为什么值得看" [--title=] [--source=] [--tags=a,b] [--status=todo|reading|done] [--digest=notes/xx/]
  node tools/lists.js content "选题" "想说什么"   [--tags=a,b] [--status=idea|drafting|done] [--draft=posts/xx/]
  node tools/lists.js pick <url> "为什么值得反复看" [--title=] [--source=] [--tags=a,b]`)
}

async function main() {
  const { pos, opt } = parseArgs(process.argv.slice(2))
  const name = (pos[0] || '').trim()

  if (!name || name === 'help' || opt.help) {
    usage()
    process.exit(0)
  }

  const cfg = LISTS[name]
  if (!cfg) die(`第一个参数只能是 ${Object.keys(LISTS).join(' / ')}`)

  const file = path.join(ROOT, cfg.rel)
  const target = (pos[1] || '').trim()
  const why = (pos[2] || '').trim()

  if (!target) {
    usage()
    die(`缺少${cfg.key === 'url' ? '链接' : '选题'}`)
  }
  if (cfg.needUrl && !/^https?:\/\//.test(target)) die('url 必须带 http(s):// 前缀')

  const status = opt.status || ''
  if (status && cfg.statuses.length && !cfg.statuses.includes(status))
    die(`status 只能是 ${cfg.statuses.join(' / ')}`)
  if (status && !cfg.statuses.length) die(`${cfg.label}没有状态字段`)

  let list = []
  if (fs.existsSync(file)) {
    try {
      list = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (!Array.isArray(list)) throw new Error('顶层不是数组')
    } catch (e) {
      die(`读取 ${cfg.rel} 失败: ${e.message}`)
    }
  }

  const idx = list.findIndex((x) => x && x[cfg.key] === target)
  const existed = idx !== -1

  // 只在新建、且没给 title/source 时才去抓网页
  let meta = { title: '', source: '' }
  if (!existed && cfg.fetch && (!opt.title || !opt.source)) {
    meta = await fetchMeta(target)
  }

  const patch = {}
  if (why) patch.why = why
  if (opt.tags) patch.tags = String(opt.tags).split(/[,，]/).map((s) => s.trim()).filter(Boolean)
  if (status) patch.status = status
  if (cfg.extra && opt[cfg.extra]) patch[cfg.extra] = sitePath(opt[cfg.extra])

  let entry
  if (existed) {
    entry = { ...list[idx] }
    for (const [k, v] of Object.entries(patch)) {
      if (entry[k] !== v) entry[k] = v
    }
  } else if (cfg.key === 'url') {
    entry = {
      title: opt.title || meta.title || hostOf(target),
      url: target,
      source: opt.source || meta.source || hostOf(target),
      added: opt.added || today(),
      status: patch.status || cfg.defaultStatus,
      why: patch.why || '',
      tags: patch.tags || [],
    }
    if (cfg.extra) entry[cfg.extra] = patch[cfg.extra] || ''
  } else {
    entry = {
      title: target,
      added: opt.added || today(),
      status: patch.status || cfg.defaultStatus,
      why: patch.why || '',
      tags: patch.tags || [],
    }
    if (cfg.extra) entry[cfg.extra] = patch[cfg.extra] || ''
  }

  // 补默认值，保证结构稳定
  entry.status = entry.status || cfg.defaultStatus
  entry.tags = entry.tags || []
  if (cfg.extra) entry[cfg.extra] = entry[cfg.extra] || ''

  if (existed && JSON.stringify(entry) === JSON.stringify(list[idx])) {
    console.log('· 没有变化，未写盘：' + entry.title)
    return
  }

  if (!entry.why && !existed) {
    console.log('⚠ 没写「为什么」。只存链接的清单，三个月后就没人看第二眼。')
  }

  if (existed) list[idx] = entry
  else list.push(entry)

  fs.writeFileSync(file, JSON.stringify(list, null, 2) + '\n', 'utf8')

  const open = list.filter((x) => x && (x.status || cfg.defaultStatus) !== 'done').length
  console.log(`${existed ? '✎ 已更新' : '✚ 已加入'} [${cfg.label}]: ${entry.title}`)
  console.log(`  ${entry.added} · ${entry.status}${entry.source ? ' · ' + entry.source : ''}`)
  console.log(`  ${cfg.rel} 共 ${list.length} 条，其中未完成 ${open} 条`)
}

main().catch((e) => die(e.stack || e.message))
