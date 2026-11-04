#!/usr/bin/env node
/**
 * 站点渲染验证：单进程完成 载入 → 量尺寸 → 截图
 * 本机 CDP 实例不能跨 Bash 调用存活，拆成多条命令会连到空白页。
 *
 * 用法: node tools/verify_site.js <输出目录> <url> [url...]
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import cp from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = 9333
const PROFILE_DIR = path.join(os.tmpdir(), 'wb-cdp-profile')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const CAND = [
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Microsoft/Edge/Application/msedge.exe'),
]

function findBrowser() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH
  for (const c of CAND) if (c && fs.existsSync(c)) return c
  throw new Error('未找到浏览器')
}

async function alive() {
  try {
    const v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
    return Boolean(v && v.webSocketDebuggerUrl)
  } catch {
    return false
  }
}

async function ensure() {
  if (await alive()) return
  const bin = findBrowser()
  fs.mkdirSync(PROFILE_DIR, { recursive: true })
  cp.spawn(
    bin,
    [
      `--remote-debugging-port=${PORT}`,
      '--remote-allow-origins=*',
      `--user-data-dir=${PROFILE_DIR}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-session-crashed-bubble',
      '--hide-crash-restore-bubble',
      '--window-size=1400,1000',
      'about:blank',
    ],
    { detached: true, stdio: 'ignore' }
  ).unref()
  for (let i = 0; i < 60 && !(await alive()); i++) await sleep(400)
}

class Cdp {
  constructor(u) {
    this.u = u
    this.seq = 0
    this.p = new Map()
  }
  connect() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(this.u)
      this.ws.addEventListener('open', () => res())
      this.ws.addEventListener('error', () => rej(new Error('WS fail')))
      this.ws.addEventListener('message', (e) => {
        let m
        try {
          m = JSON.parse(e.data)
        } catch {
          return
        }
        if (m.id && this.p.has(m.id)) {
          const { resolve, reject } = this.p.get(m.id)
          this.p.delete(m.id)
          m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
        }
      })
    })
  }
  send(method, params = {}, sid, t = 30000) {
    const id = ++this.seq
    const pl = { id, method, params }
    if (sid) pl.sessionId = sid
    return new Promise((res, rej) => {
      this.p.set(id, { resolve: res, reject: rej })
      this.ws.send(JSON.stringify(pl))
      setTimeout(() => {
        if (this.p.has(id)) {
          this.p.delete(id)
          rej(new Error('timeout ' + method))
        }
      }, t)
    })
  }
  close() {
    try {
      this.ws.close()
    } catch {}
  }
}

const outDir = process.argv[2] || path.join(__dirname, '..', '_shots')
const mobile = process.argv.includes('--mobile')
const urls = process.argv.slice(3).filter((u) => !u.startsWith('--'))
if (!urls.length) {
  console.error('用法: node tools/verify_site.js <输出目录> <url> [url...]')
  process.exit(1)
}
fs.mkdirSync(outDir, { recursive: true })

await ensure()
const ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
const cdp = new Cdp(ver.webSocketDebuggerUrl)
await cdp.connect()

const { targetInfos } = await cdp.send('Target.getTargets')
const pages = targetInfos.filter((t) => t.type === 'page')
const t = pages.find((x) => x.url.startsWith('about:')) || pages[0]
const { sessionId: sid } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true })
await cdp.send('Page.enable', {}, sid)
await cdp.send('Runtime.enable', {}, sid)

const report = []

if (mobile) {
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
    sid
  )
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true }, sid)
  console.log('移动端模拟：390 × 844 @2x\n')
}

for (let i = 0; i < urls.length; i++) {
  const url = urls[i]
  await cdp.send('Page.navigate', { url }, sid)
  for (let k = 0; k < 60; k++) {
    await sleep(150)
    try {
      const r = await cdp.send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true }, sid)
      if (r.result && r.result.value === 'complete') break
    } catch {}
  }
  await sleep(1500)

  // 分段滚到底再回顶，触发全部懒加载；一次 scrollTo 会被 smooth 行为吞掉
  await cdp.send(
    'Runtime.evaluate',
    {
      expression: `(async () => {
        const h = document.body.scrollHeight;
        for (let y = 0; y < h; y += 500) {
          window.scrollTo(0, y);
          await new Promise(r => setTimeout(r, 70));
        }
        window.scrollTo(0, 0);
      })()`,
      awaitPromise: true,
    },
    sid,
    30000
  )
  await sleep(1200)

  const m = await cdp.send(
    'Runtime.evaluate',
    {
      expression: `(() => {
        const de = document.documentElement;
        const doc = document.querySelector('.vp-doc');
        const content = document.querySelector('.content-container');
        const rect = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { l: Math.round(r.left), w: Math.round(r.width) }; };
        const imgs = [...document.images].map(i => ({ src: i.currentSrc.split('/').pop(), w: i.naturalWidth, h: i.naturalHeight, ok: i.complete && i.naturalWidth > 0, loading: i.loading, complete: i.complete, boxW: Math.round(i.getBoundingClientRect().width) }));
        const bad = imgs.filter(x => !x.ok);
        return JSON.stringify({
          title: document.title,
          scrollW: de.scrollWidth,
          clientW: de.clientWidth,
          scrollH: de.scrollHeight,
          overflowX: de.scrollWidth > de.clientWidth + 1,
          docW: doc ? Math.round(doc.getBoundingClientRect().width) : null,
          contentW: content ? Math.round(content.getBoundingClientRect().width) : null,
          heroContainer: rect('.VPHero .container'),
          heroMain: rect('.VPHero .main'),
          homeWrap: rect('.home-wrap'),
          postItem: rect('.post-item'),
          imgCount: imgs.length,
          imgBad: bad.map(x => x.src + ' nat=' + x.w + ' box=' + x.boxW + ' loading=' + x.loading + ' complete=' + x.complete),
          imgSizes: imgs.map(x => x.w + 'x' + x.h),
          h2: document.querySelectorAll('.vp-doc h2').length,
          h3: document.querySelectorAll('.vp-doc h3').length,
          table: document.querySelectorAll('.vp-doc table').length,
          mark: document.querySelectorAll('.vp-doc mark').length,
          postItems: document.querySelectorAll('.post-item').length
        });
      })()`,
      returnByValue: true,
    },
    sid
  )
  const info = JSON.parse(m.result.value)
  const name = `_s${String(i + 1).padStart(2, '0')}_${url.replace(/^https?:\/\/[^/]+\/blog\/?/, '').replace(/[\/?=]/g, '_') || 'home'}`
  report.push({ url, ...info })

  const h = Math.min(info.scrollH, 2400)
  const shot = await cdp.send(
    'Page.captureScreenshot',
    { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: info.clientW, height: h, scale: 1 } },
    sid,
    60000
  )
  const file = path.join(outDir, name + '.png')
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'))

  console.log(`\n[${i + 1}] ${url}`)
  console.log(`    title      ${info.title}`)
  console.log(`    width      client ${info.clientW} / scroll ${info.scrollW}${info.overflowX ? ' ⚠ 横向溢出' : ' ✅'}`)
  console.log(`    height     ${info.scrollH}`)
  console.log(`    正文宽     ${info.contentW ?? '-'}px   .vp-doc ${info.docW ?? '-'}px`)
  const fmt = (r) => (r ? `left ${r.l} / w ${r.w}` : '-')
  console.log(
    `    对齐      hero ${fmt(info.heroContainer)} · main ${fmt(info.heroMain)} · wrap ${fmt(info.homeWrap)} · item ${fmt(info.postItem)}`
  )
  console.log(`    结构       h2 ${info.h2} · h3 ${info.h3} · 表 ${info.table} · mark ${info.mark} · 列表项 ${info.postItems}`)
  console.log(`    图片       ${info.imgCount} 张${info.imgBad.length ? ' ⚠ 未就绪' : ' ✅ 全部加载'}`)
  if (info.imgBad.length) info.imgBad.forEach((b) => console.log(`               · ${b}`))
  console.log(`    截图       ${file}`)
}

fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8')
console.log('\n报告已写入', path.join(outDir, 'report.json'))

await cdp.send('Browser.close').catch(() => {})
cdp.close()
process.exit(0)
