<script setup>
import { computed } from 'vue'
import { useData } from 'vitepress'
import { data as postsData } from '../../posts/posts.data.js'
import { data as notesData } from '../../notes/notes.data.js'

const props = defineProps({
  type: { type: String, default: 'posts' },
  limit: { type: Number, default: 0 },
})

const { site } = useData()

const list = computed(() => {
  const src = props.type === 'notes' ? notesData : postsData
  return props.limit > 0 ? src.slice(0, props.limit) : src
})

function href(url) {
  const base = (site.value.base || '/').replace(/\/$/, '')
  return base + url
}

function fmtDate(d) {
  const m = String(d || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (!m) return String(d || '')
  return `${m[1]}.${String(m[2]).padStart(2, '0')}.${String(m[3]).padStart(2, '0')}`
}
</script>

<template>
  <div class="post-list">
    <a v-for="p in list" :key="p.url" class="post-item" :href="href(p.url)">
      <div class="post-meta">
        <time v-if="p.date">{{ fmtDate(p.date) }}</time>
        <template v-if="p.date && p.tags && p.tags.length">
          <span class="post-sep">/</span>
        </template>
        <span v-if="p.tags && p.tags.length">{{ p.tags.join(' / ') }}</span>
      </div>
      <h3>{{ p.title }}</h3>
      <p v-if="p.description" class="post-desc">{{ p.description }}</p>
    </a>
    <p v-if="!list.length" class="post-empty">这里还是空的。</p>
  </div>
</template>
