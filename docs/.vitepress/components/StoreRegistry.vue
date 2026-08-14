<template>
  <div class="mioki-store">
    <div class="store-toolbar">
      <input
        v-model.trim="searchInput"
        class="store-search"
        placeholder="搜索包名、描述或标签..."
        @keydown.enter="applySearch"
      />
    </div>

    <div v-if="loading" class="store-loading">
      <div class="store-spinner"></div>
      <span>正在加载...</span>
    </div>

    <div v-else-if="error" class="store-error">
      {{ error }}
    </div>

    <template v-else>
      <div v-if="allTags.length" class="store-tags">
        <button v-for="tag in allTags" :key="tag" class="store-tag" @click="searchByTag(tag)">#{{ tag }}</button>
      </div>

      <p class="store-summary">
        {{ total }} 个结果
        <template v-if="searchQuery"> · 搜索：{{ searchQuery }}</template>
      </p>

      <div class="store-grid">
        <div v-for="item in items" :key="item.npm" class="store-card">
          <div class="store-card-top">
            <h3 class="store-card-name">{{ item.name }}</h3>
            <div class="store-badges">
              <span class="store-badge store-badge--type">{{ type === 'plugin' ? '插件' : '适配器' }}</span>
              <span v-if="item.official" class="store-badge store-badge--official">官方</span>
              <span v-else class="store-badge store-badge--community">社区</span>
            </div>
          </div>

          <p class="store-card-desc">{{ item.description || '暂无描述' }}</p>

          <div v-if="item.tags?.length" class="store-tags-inline">
            <span v-for="tag in item.tags.slice(0, 4)" :key="tag" class="store-tag-chip">{{ tag }}</span>
          </div>

          <div class="store-card-footer">
            <span class="store-card-meta">
              <span v-if="item.version" class="store-card-version">v{{ item.version }}</span>
              <a v-if="item.repo" :href="toBrowserUrl(item.repo)" target="_blank" rel="noopener" class="store-card-link"
                >仓库</a
              >
              <a :href="item.npmUrl" target="_blank" rel="noopener" class="store-card-link">npm</a>
            </span>
            <button class="store-copy-btn" :class="{ 'store-copy-btn--copied': copied === item.npm }" :title="`npm install ${item.npm}`" @click="copyInstall(item.npm)">
              <svg v-if="copied === item.npm" class="store-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <svg v-else class="store-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <p v-if="items.length === 0" class="store-empty">
        {{ searchQuery ? '没有匹配的结果' : '暂无收录' }}
      </p>

      <div v-if="totalPages > 1" class="store-pagination">
        <button class="store-page-btn" :disabled="page <= 1" @click="prevPage">上一页</button>
        <span class="store-page-info">{{ page }} / {{ totalPages }}</span>
        <button class="store-page-btn" :disabled="page >= totalPages" @click="nextPage">下一页</button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'

const props = defineProps({
  type: {
    type: String,
    default: 'plugin',
  },
})

const PAGE_SIZE = 12
const NPM_SEARCH_URL = 'https://registry.npmjs.org/-/v1/search'

const prefix = computed(() => (props.type === 'plugin' ? 'mioki-plugin-' : 'mioki-adapter-'))

const searchInput = ref('')
const searchQuery = ref('')
const page = ref(1)
const loading = ref(true)
const error = ref('')
const allPackages = ref([])
const copied = ref('')

async function copyInstall(packageName) {
  const text = `npm install ${packageName}`
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
  copied.value = packageName
  setTimeout(() => {
    if (copied.value === packageName) copied.value = ''
  }, 2000)
}

function stripPrefix(name) {
  return name.startsWith(prefix.value) ? name.slice(prefix.value.length) : name
}

function normalizeRepoUrl(repo) {
  if (!repo) return ''
  let raw = typeof repo === 'string' ? repo : repo?.url || ''
  if (!raw) return ''
  raw = raw.trim().replace(/^git\+/, '')
  if (raw.startsWith('git@')) {
    const m = raw.match(/^git@([^:]+):(.+)$/)
    if (m) raw = `https://${m[1]}/${m[2]}`
  }
  return raw.replace(/\.git$/, '')
}

function toBrowserUrl(raw) {
  if (!raw) return ''
  let url = raw.trim()
  if (url.startsWith('git@')) {
    const m = url.match(/^git@([^:]+):(.+)$/)
    if (m) url = `https://${m[1]}/${m[2]}`
  }
  return url.replace(/^git\+/, '').replace(/\.git$/, '')
}

async function loadStore() {
  loading.value = true
  error.value = ''
  try {
    const url = new URL(NPM_SEARCH_URL)
    url.searchParams.set('text', 'mioki')
    url.searchParams.set('size', '200')

    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`npm 搜索失败 (HTTP ${res.status})`)
    const data = await res.json()

    const seen = new Map()
    for (const obj of data?.objects || []) {
      const pkg = obj?.package
      if (!pkg) continue
      const name = String(pkg.name || '').trim()
      if (!name.startsWith(prefix.value) || seen.has(name)) continue

      const keywords = Array.isArray(pkg.keywords) ? pkg.keywords.map(String) : []
      if (!keywords.includes('mioki')) continue

      seen.set(name, {
        name: stripPrefix(name),
        npm: name,
        description: String(pkg.description || '').trim(),
        version: String(pkg.version || '').trim(),
        keywords,
        tags: keywords.filter((k) => k !== 'mioki'),
        official: false,
        repo: normalizeRepoUrl(pkg.repository),
        npmUrl: String(pkg.links?.npm || `https://www.npmjs.com/package/${name}`),
      })
    }

    allPackages.value = Array.from(seen.values())
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

const filteredItems = computed(() => {
  let list = [...allPackages.value]

  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.npm.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q)) ||
        item.keywords.some((k) => k.toLowerCase().includes(q)),
    )
  }

  list.sort((a, b) => a.name.localeCompare(b.name))
  return list
})

const items = computed(() => {
  const offset = (page.value - 1) * PAGE_SIZE
  return filteredItems.value.slice(offset, offset + PAGE_SIZE)
})

const total = computed(() => filteredItems.value.length)
const hasMore = computed(() => page.value * PAGE_SIZE < total.value)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

const allTags = computed(() => {
  const set = new Set()
  for (const item of filteredItems.value) {
    for (const tag of item.tags || []) {
      if (tag) set.add(tag)
    }
  }
  return Array.from(set).slice(0, 12)
})

function applySearch() {
  page.value = 1
  searchQuery.value = searchInput.value.trim()
}

function searchByTag(tag) {
  searchInput.value = tag
  searchQuery.value = tag
  page.value = 1
}

function prevPage() {
  if (page.value <= 1) return
  page.value -= 1
}

function nextPage() {
  if (!hasMore.value) return
  page.value += 1
}

onMounted(() => {
  loadStore()
})
</script>

<style scoped>
.mioki-store {
  margin-top: 0.5rem;
}

.store-toolbar {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}

.store-search {
  flex: 1;
  min-width: 180px;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  border: 1px solid var(--vp-c-default-soft);
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  font-size: 0.85rem;
}

.store-search:focus {
  outline: none;
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 0 0 2px var(--vp-c-brand-soft);
}

.store-loading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 2rem;
  color: var(--vp-c-text-2);
  font-size: 0.85rem;
  justify-content: center;
}

.store-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--vp-c-default-soft);
  border-top-color: var(--vp-c-brand-1);
  border-radius: 50%;
  animation: mioki-spin 0.6s linear infinite;
}

@keyframes mioki-spin {
  to {
    transform: rotate(360deg);
  }
}

.store-error {
  padding: 0.75rem 1rem;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.08);
  color: #ef4444;
  font-size: 0.85rem;
}

.store-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
}

.store-tag {
  padding: 0.25rem 0.6rem;
  border: none;
  border-radius: 4px;
  background: var(--vp-c-default-soft);
  color: var(--vp-c-text-2);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.store-tag:hover {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

.store-summary {
  margin-bottom: 0.75rem;
  color: var(--vp-c-text-3);
  font-size: 0.8rem;
}

.store-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 0.75rem;
}

.store-card {
  padding: 1rem;
  border-radius: 8px;
  border: 1px solid var(--vp-c-default-soft);
  background: var(--vp-c-bg-soft);
  transition: all 0.2s ease;
}

.store-card:hover {
  border-color: var(--vp-c-brand-soft);
}

.store-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.store-card-name {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  font-family: var(--vp-font-family-mono), monospace;
}

.store-badges {
  display: flex;
  gap: 0.3rem;
  flex-shrink: 0;
}

.store-badge {
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  font-size: 0.65rem;
  font-weight: 500;
}

.store-badge--type {
  background: var(--vp-c-default-soft);
  color: var(--vp-c-text-2);
}

.store-badge--official {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.store-badge--community {
  background: rgba(56, 189, 248, 0.1);
  color: #38bdf8;
}

.store-card-desc {
  margin: 0 0 0.5rem;
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
  line-height: 1.5;
}

.store-tags-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-bottom: 0.5rem;
}

.store-tag-chip {
  font-size: 0.7rem;
  color: var(--vp-c-text-3);
}

.store-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.store-card-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
}

.store-card-version {
  font-family: var(--vp-font-family-mono), monospace;
}

.store-copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--vp-c-default-soft);
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 0.15s ease;
}

.store-copy-btn:hover {
  border-color: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}

.store-copy-btn--copied {
  border-color: rgba(16, 185, 129, 0.3);
  color: #10b981;
}

.store-copy-icon {
  width: 14px;
  height: 14px;
}

.store-card-link {
  color: var(--vp-c-brand-1);
  text-decoration: none;
  font-weight: 500;
  transition: opacity 0.15s ease;
}

.store-card-link:hover {
  opacity: 0.8;
}

.store-empty {
  color: var(--vp-c-text-3);
  font-size: 0.85rem;
  padding: 1rem 0;
  text-align: center;
}

.store-pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1rem;
}

.store-page-btn {
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--vp-c-default-soft);
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.store-page-btn:hover {
  border-color: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}

.store-page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.store-page-info {
  font-size: 0.8rem;
  color: var(--vp-c-text-3);
}
</style>
