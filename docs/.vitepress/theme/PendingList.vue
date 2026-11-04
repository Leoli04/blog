<script setup>
import { computed, onMounted, ref } from 'vue'
import { useData } from 'vitepress'
import items from '../../pending/items.json'

const { site } = useData()

const STATUS = {
  todo: { label: '待读', order: 1 },
  reading: { label: '在读', order: 2 },
  done: { label: '已消化', order: 3 },
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
        // 待读按加入时间正序：先看到的先读，新链接不许插队
        // 已消化按时间倒序：最近读完的排前面
        .sort((a, b) =>
          key === 'done' ? ts(b.added) - ts(a.added) : ts(a.added) - ts(b.added)
        ),
    }))
    .filter((g) => g.list.length > 0)
})

const total = computed(() => (items || []).filter((x) => x && x.title).length)
const pendingCount = computed(
  () => (items || []).filter((x) => x && x.title && (x.status || 'todo') !== 'done').length
)

function isStale(p) {
  if (!mounted.value) return false
  if ((p.status || 'todo') === 'done') return false
  return daysSince(p.added) > 30
}
</script>

<template>
  <div class="pend">
    <p v-if="total" class="pend-summary">
      还有 <b>{{ pendingCount }}</b> 篇没消化，一共 {{ total }} 篇。
    </p>

    <section v-for="g in groups" :key="g.key" class="pend-group">
      <h2 class="pend-group-title">
        {{ g.label }}<span class="pend-count">{{ g.list.length }}</span>
      </h2>

      <div
        v-for="p in g.list"
        :key="p.url"
        class="pend-item"
        :class="'is-' + (p.status || 'todo')"
      >
        <a class="pend-title" :href="href(p.url)" target="_blank" rel="noopener noreferrer">
          {{ p.title }}<span class="pend-arrow">↗</span>
        </a>

        <div class="pend-meta">
          <span v-if="p.source" class="pend-src">{{ p.source }}</span>
          <span v-if="p.added">{{ fmtDate(p.added) }} 加入</span>
          <span v-if="p.tags && p.tags.length">{{ p.tags.join(' · ') }}</span>
        </div>

        <p v-if="p.why" class="pend-why">{{ p.why }}</p>

        <div v-if="isStale(p) || p.digest" class="pend-foot">
          <span v-if="isStale(p)" class="pend-stale">放了 {{ daysSince(p.added) }} 天</span>
          <a v-if="p.digest" class="pend-digest" :href="href(p.digest)">消化完的笔记 →</a>
        </div>
      </div>
    </section>

    <p v-if="!total" class="post-empty">还没有条目。看到好东西随手丢进来。</p>
  </div>
</template>
