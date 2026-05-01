<template>
  <div class="page-wrapper">
    <!-- Header -->
    <header class="admin-header">
      <div>
        <h1>Admin Dashboard</h1>
        <p v-if="config?.event?.name" class="event-name">{{ config.event.name }}</p>
      </div>
      <div class="header-actions">
        <a :href="`${apiBase}/api/admin/export.csv`" class="btn btn-outline" download>
          ↓ Export CSV
        </a>
        <button class="btn btn-ghost" @click="logout">Sign out</button>
      </div>
    </header>

    <!-- Stats -->
    <div class="stats-row">
      <div class="stat-card card">
        <span class="stat-value">{{ stats.respondents }}</span>
        <span class="stat-label">Respondents</span>
      </div>
      <div class="stat-card card">
        <span class="stat-value">{{ stats.totalSignups }}</span>
        <span class="stat-label">Total sign-ups</span>
      </div>
      <div class="stat-card card">
        <span class="stat-value">{{ stats.mostPopularTitle || '—' }}</span>
        <span class="stat-label">Most popular seminar</span>
      </div>
    </div>

    <!-- View toggle -->
    <div class="view-toggle" role="tablist">
      <button
        class="view-tab"
        :class="{ active: view === 'seminar' }"
        role="tab"
        @click="view = 'seminar'"
      >
        By Seminar
      </button>
      <button
        class="view-tab"
        :class="{ active: view === 'person' }"
        role="tab"
        @click="view = 'person'"
      >
        By Person
      </button>
    </div>

    <!-- By Seminar -->
    <div v-if="view === 'seminar'" class="view-content">
      <div
        v-for="seminar in config?.seminars"
        :key="seminar.id"
        class="group-card card"
      >
        <div class="group-header">
          <div>
            <h3 class="group-title">{{ seminar.title }}</h3>
            <p class="group-meta">{{ seminar.day }} &middot; {{ seminar.time }} &middot; {{ seminar.room }}</p>
          </div>
          <span class="badge">{{ (bookingsBySeminar[seminar.id] ?? []).length }}</span>
        </div>
        <ul v-if="bookingsBySeminar[seminar.id]?.length" class="attendee-list">
          <li v-for="email in bookingsBySeminar[seminar.id]" :key="email">{{ email }}</li>
        </ul>
        <p v-else class="empty-state">No sign-ups yet.</p>
      </div>
      <p v-if="!config?.seminars?.length" class="empty-state">No seminars found in config.</p>
    </div>

    <!-- By Person -->
    <div v-if="view === 'person'" class="view-content">
      <div
        v-for="(seminarIds, email) in allBookings"
        :key="email"
        class="group-card card"
      >
        <div class="group-header">
          <h3 class="group-title">{{ email }}</h3>
          <span class="badge">{{ seminarIds.length }}</span>
        </div>
        <ul class="attendee-list">
          <li v-for="id in seminarIds" :key="id">
            {{ seminarById(id)?.title ?? id }}
            <span class="pill-meta">{{ seminarById(id)?.day }}</span>
          </li>
        </ul>
      </div>
      <p v-if="!Object.keys(allBookings).length" class="empty-state">No bookings recorded yet.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'admin' })

interface Seminar {
  id: string
  day: string
  time: string
  room: string
  title: string
}

interface Config {
  event: { name: string; subtitle?: string }
  days: string[]
  participants: string[]
  seminars: Seminar[]
}

const { public: { apiBase } } = useRuntimeConfig()

const view = ref<'seminar' | 'person'>('seminar')
const config = ref<Config | null>(null)
const allBookings = ref<Record<string, string[]>>({})

async function fetchData() {
  const [cfg, bookings] = await Promise.all([
    $fetch<Config>(`${apiBase}/api/config`),
    $fetch<Record<string, string[]>>(`${apiBase}/api/admin/bookings`),
  ])
  config.value = cfg
  allBookings.value = bookings
}

const bookingsBySeminar = computed(() => {
  const map: Record<string, string[]> = {}
  for (const [email, ids] of Object.entries(allBookings.value)) {
    for (const id of ids) {
      if (!map[id]) map[id] = []
      map[id].push(email)
    }
  }
  return map
})

const stats = computed(() => {
  const respondents = Object.keys(allBookings.value).length
  const totalSignups = Object.values(allBookings.value).reduce((s, ids) => s + ids.length, 0)

  let mostPopularId = ''
  let max = 0
  for (const [id, emails] of Object.entries(bookingsBySeminar.value)) {
    if (emails.length > max) {
      max = emails.length
      mostPopularId = id
    }
  }

  const mostPopularTitle = mostPopularId
    ? (seminarById(mostPopularId)?.title ?? mostPopularId)
    : ''

  return { respondents, totalSignups, mostPopularTitle }
})

function seminarById(id: string): Seminar | undefined {
  return config.value?.seminars?.find((s) => s.id === id)
}

async function logout() {
  await $fetch(`${apiBase}/api/admin/logout`, { method: 'POST' })
  await navigateTo('/admin/login')
}

onMounted(fetchData)
</script>

<style scoped>
.admin-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.75rem;
}

.admin-header h1 {
  font-size: 1.875rem;
  font-weight: 700;
}

.event-name {
  color: var(--muted);
  margin-top: .2rem;
}

.header-actions {
  display: flex;
  gap: .75rem;
  align-items: center;
}

/* Stats */
.stats-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.75rem;
}

.stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 1.25rem;
  gap: .25rem;
}

.stat-value {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--primary);
  word-break: break-word;
}

.stat-label {
  font-size: .85rem;
  color: var(--muted);
}

/* View toggle */
.view-toggle {
  display: flex;
  gap: .25rem;
  margin-bottom: 1.5rem;
  background: var(--border);
  border-radius: var(--radius);
  padding: .2rem;
  width: fit-content;
}

.view-tab {
  padding: .45rem 1.1rem;
  border-radius: calc(var(--radius) - 2px);
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: .9rem;
  font-weight: 500;
  transition: all .15s;
}

.view-tab.active {
  background: #fff;
  color: var(--text);
  box-shadow: 0 1px 3px rgba(0,0,0,.1);
}

/* Group cards */
.view-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.group-card {
  padding: 1.25rem 1.5rem;
}

.group-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: .75rem;
  margin-bottom: .75rem;
}

.group-title {
  font-size: 1.05rem;
  font-weight: 600;
}

.group-meta {
  font-size: .85rem;
  color: var(--muted);
  margin-top: .15rem;
}

.badge {
  flex-shrink: 0;
  background: var(--primary-light);
  color: var(--primary);
  font-size: .8rem;
  font-weight: 600;
  padding: .2rem .6rem;
  border-radius: 999px;
  min-width: 2rem;
  text-align: center;
}

.attendee-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: .3rem;
}

.attendee-list li {
  font-size: .9rem;
  padding: .3rem .5rem;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: .5rem;
}

.attendee-list li:nth-child(odd) {
  background: var(--bg);
}

.pill-meta {
  font-size: .8rem;
  color: var(--muted);
}
</style>
