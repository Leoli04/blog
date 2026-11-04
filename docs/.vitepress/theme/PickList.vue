<script setup>
import { computed } from 'vue'
import { useData } from 'vitepress'
import items from '../../picks/items.json'

const props = defineProps({
  limit: { type: Number, default: 0 },
  // 首页用：列表末尾给一个「全部收藏」的入口
  more: { type: Boolean, default: false },
})

const { site } = useData()

function ts(d) {
  const m = String(d || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (!m) return 0
  return Date.parse(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T00:00:00+08:00`)
}

function fmtDate(d) {
  const m = String(d || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (!m) return String(d || '')
  return `${m[1]}.${String(m[2]).padStart(2, '0')}.${String(m[3]).padStart(2, '0')}`
}

function href(url) {
  if (/^https?:\/\//.test(url)) return url
  const base = (site.value.base || '/').replace(/\/$/, '')
  return base + url
}

// 最近收的在前：回看时通常想起的是「前阵子那篇」
const list = computed(() => {
  const all = (items || [])
    .filter((x) => x && x.title)
    .slice()
    .sort((a, b) => ts(b.added) - ts(a.added))
  return props.limit > 0 ? all.slice(0, props.limit) : all
})

const total = computed(() => (items || []).filter((x) => x && x.title).length)
</script>

<template>
  <div class="list pick-list">
    <p v-if="total && !limit" class="list-summary">收了 {{ total }} 篇。</p>

    <div v-for="p in list" :key="p.url" class="list-item is-pick">
      <a class="list-title" :href="href(p.url)" target="_blank" rel="noopener noreferrer">
        {{ p.title }}&nbsp;<span class="list-arrow">↗</span>
      </a>

      <div class="list-meta">
        <span v-if="p.source" class="list-src">{{ p.source }}</span>
        <span v-if="p.added">{{ fmtDate(p.added) }} 收藏</span>
        <span v-if="p.tags && p.tags.length">{{ p.tags.join(' · ') }}</span>
      </div>

      <p v-if="p.why" class="list-why">{{ p.why }}</p>
    </div>

    <p v-if="!total" class="post-empty">还没收藏。读完觉得值得再看第二遍的，才放进来。</p>

    <p v-if="more && total" class="home-more">
      <a :href="href('/picks/')">全部收藏 →</a>
    </p>
  </div>
</template>
