<script setup>
import { computed, onMounted, ref } from 'vue'
import { useData } from 'vitepress'
import items from '../../todo/read.json'

const { site } = useData()

const STATUS = {
  todo: { label: '待看', order: 1 },
  reading: { label: '在读', order: 2 },
  done: { label: '已读', order: 3 },
}

// 服务端预渲染时不算天数，避免 build 与 hydrate 的 Date.now() 不一致
const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})

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

function daysSince(d) {
  const t = ts(d)
  if (!t) return 0
  return Math.floor((Date.now() - t) / 86400000)
}

function href(url) {
  if (/^https?:\/\//.test(url)) return url
  const base = (site.value.base || '/').replace(/\/$/, '')
  return base + url
}

const groups = computed(() => {
  const all = (items || []).filter((x) => x && x.title)
  return ['todo', 'reading', 'done']
    .map((key) => ({
      key,
      label: STATUS[key].label,
      list: all
        .filter((x) => (x.status || 'todo') === key)
        // 待看按加入时间正序：先看到的先读，新链接不许插队
        // 已读按时间倒序：最近读完的排前面
        .sort((a, b) =>
          key === 'done' ? ts(b.added) - ts(a.added) : ts(a.added) - ts(b.added)
        ),
    }))
    .filter((g) => g.list.length > 0)
})

const total = computed(() => (items || []).filter((x) => x && x.title).length)
const openCount = computed(
  () => (items || []).filter((x) => x && x.title && (x.status || 'todo') !== 'done').length
)

function isStale(p) {
  if (!mounted.value) return false
  if ((p.status || 'todo') === 'done') return false
  return daysSince(p.added) > 30
}
</script>

<template>
  <div class="list">
    <p v-if="total" class="list-summary">
      还有 <b>{{ openCount }}</b> 篇没看，一共 {{ total }} 篇。
    </p>

    <section v-for="g in groups" :key="g.key" class="list-group">
      <h2 class="list-group-title">
        {{ g.label }}<span class="list-count">{{ g.list.length }}</span>
      </h2>

      <div
        v-for="p in g.list"
        :key="p.url"
        class="list-item"
        :class="'is-' + (p.status || 'todo')"
      >
        <a class="list-title" :href="href(p.url)" target="_blank" rel="noopener noreferrer">
          {{ p.title }}&nbsp;<span class="list-arrow">↗</span>
        </a>

        <div class="list-meta">
          <span v-if="p.source" class="list-src">{{ p.source }}</span>
          <span v-if="p.added">{{ fmtDate(p.added) }} 加入</span>
          <span v-if="p.tags && p.tags.length">{{ p.tags.join(' · ') }}</span>
        </div>

        <p v-if="p.why" class="list-why">{{ p.why }}</p>

        <div v-if="isStale(p) || p.digest" class="list-foot">
          <span v-if="isStale(p)" class="list-stale">放了 {{ daysSince(p.added) }} 天</span>
          <a v-if="p.digest" class="list-link" :href="href(p.digest)">读完写的笔记 →</a>
        </div>
      </div>
    </section>

    <p v-if="!total" class="post-empty">清单是空的。看到好东西随手丢进来。</p>
  </div>
</template>
