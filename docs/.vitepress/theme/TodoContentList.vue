<script setup>
import { computed, onMounted, ref } from 'vue'
import { useData } from 'vitepress'
import items from '../../todo/content.json'

const { site } = useData()

const STATUS = {
  idea: { label: '想法', order: 1 },
  drafting: { label: '在写', order: 2 },
  done: { label: '已发', order: 3 },
}

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
  return ['idea', 'drafting', 'done']
    .map((key) => ({
      key,
      label: STATUS[key].label,
      list: all
        .filter((x) => (x.status || 'idea') === key)
        // 想法按记下的时间正序：先记的先写
        // 已发按时间倒序：最近发的排前面
        .sort((a, b) =>
          key === 'done' ? ts(b.added) - ts(a.added) : ts(a.added) - ts(b.added)
        ),
    }))
    .filter((g) => g.list.length > 0)
})

const total = computed(() => (items || []).filter((x) => x && x.title).length)
const openCount = computed(
  () => (items || []).filter((x) => x && x.title && (x.status || 'idea') !== 'done').length
)

function isStale(p) {
  if (!mounted.value) return false
  if ((p.status || 'idea') === 'done') return false
  return daysSince(p.added) > 30
}
</script>

<template>
  <div class="list">
    <p v-if="total" class="list-summary">
      手上有 <b>{{ openCount }}</b> 个选题没写完，一共 {{ total }} 个。
    </p>

    <section v-for="g in groups" :key="g.key" class="list-group">
      <h2 class="list-group-title">
        {{ g.label }}<span class="list-count">{{ g.list.length }}</span>
      </h2>

      <div
        v-for="p in g.list"
        :key="p.title"
        class="list-item"
        :class="'is-' + (p.status || 'idea')"
      >
        <a
          v-if="p.draft"
          class="list-title"
          :href="href(p.draft)"
        >{{ p.title }}&nbsp;<span class="list-arrow">→</span></a>
        <span v-else class="list-title is-text">{{ p.title }}</span>

        <div class="list-meta">
          <span v-if="p.added">{{ fmtDate(p.added) }} 记下</span>
          <span v-if="p.tags && p.tags.length">{{ p.tags.join(' · ') }}</span>
        </div>

        <p v-if="p.why" class="list-why">{{ p.why }}</p>

        <div v-if="isStale(p) || p.draft" class="list-foot">
          <span v-if="isStale(p)" class="list-stale">记了 {{ daysSince(p.added) }} 天还没动</span>
          <a v-if="p.draft" class="list-link" :href="href(p.draft)">看稿子 →</a>
        </div>
      </div>
    </section>

    <p v-if="!total" class="post-empty">
      还没有记下来的选题。想写什么，先把「想说什么」写一句。
    </p>
  </div>
</template>
