<template>
  <div class="page-wrapper">
    <!-- Header -->
    <header class="page-header">
      <h1>{{ config?.event?.name ?? 'Seminar Sign-up' }}</h1>
      <p v-if="config?.event?.subtitle">{{ config.event.subtitle }}</p>
    </header>

    <!-- Email selector -->
    <section class="card email-card">
      <label class="field-label" for="email-input">Your email address</label>
      <div class="combobox-wrap">
        <input
          id="email-input"
          v-model="emailSearch"
          type="email"
          inputmode="email"
          class="combobox-input"
          placeholder="Type to search…"
          autocomplete="email"
          spellcheck="false"
          @focus="dropdownOpen = true"
          @blur="onBlur"
          @keydown.enter.prevent="pickFirstMatch"
          @keydown.escape="dropdownOpen = false"
          @input="dropdownOpen = true"
        />
        <ul
          ref="comboboxDropdownRef"
          popover="manual"
          class="combobox-list"
          role="listbox"
        >
          <li
            v-for="email in filteredEmails"
            :key="email"
            class="combobox-item"
            :class="{ 'is-selected': email === selectedEmail }"
            role="option"
            @mousedown.prevent="selectEmail(email)"
          >
            {{ email }}
          </li>
        </ul>
      </div>
      <p v-if="selectedEmail" class="email-confirmed">
        Showing selections for <strong>{{ selectedEmail }}</strong>
      </p>
    </section>

    <!-- Day tabs -->
    <div v-if="selectedEmail && days.length" class="day-tabs" role="tablist">
      <button
        v-for="day in days"
        :key="day"
        class="day-tab"
        :class="{ active: selectedDay === day }"
        role="tab"
        :aria-selected="selectedDay === day"
        @click="selectedDay = day"
      >
        {{ day }}
      </button>
    </div>

    <!-- Seminars grid -->
    <div v-if="selectedEmail && selectedDay">
      <div v-if="daySeminars.length" class="seminars-grid">
        <article
          v-for="seminar in daySeminars"
          :key="seminar.id"
          class="seminar-card"
          :class="{ 'is-booked': selectedIds.has(seminar.id) }"
        >
          <div class="seminar-body">
            <h3 class="seminar-title">{{ seminar.title }}</h3>
            <p class="seminar-meta">{{ seminar.time }} &middot; {{ seminar.room }}</p>
          </div>
          <button
            class="toggle-btn"
            :class="{ booked: selectedIds.has(seminar.id) }"
            @click="toggleSeminar(seminar.id)"
          >
            {{ selectedIds.has(seminar.id) ? '✓ Signed up' : 'Sign up' }}
          </button>
        </article>
      </div>
      <p v-else class="empty-state">No seminars scheduled for this day.</p>
    </div>

    <!-- Save status toast -->
    <div
      ref="toastRef"
      popover="manual"
      class="save-toast"
      :class="`toast-${saveStatus}`"
    >
      {{ saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Changes saved!' : 'Error saving — please try again.' }}
    </div>
  </div>
</template>

<script setup lang="ts">
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

const config = ref<Config | null>(null)
const emailSearch = ref('')
const selectedEmail = ref('')
const dropdownOpen = ref(false)
const selectedDay = ref('')
const selectedIds = ref<Set<string>>(new Set())
const saveStatus = ref<'' | 'saving' | 'saved' | 'error'>('')
const toastRef = ref<HTMLElement | null>(null)
const comboboxDropdownRef = ref<HTMLElement | null>(null)

watch(saveStatus, (newStatus) => {
  if (!import.meta.client) return
  if (newStatus) {
    try {
      toastRef.value?.showPopover()
    } catch (e) {
      console.warn('Popover show failed:', e)
    }
  } else {
    try {
      toastRef.value?.hidePopover()
    } catch (e) {
      console.warn('Popover hide failed:', e)
    }
  }
})

const isDropdownVisible = computed(() => dropdownOpen.value && filteredEmails.value.length > 0)

watch(isDropdownVisible, (visible) => {
  if (!import.meta.client) return
  if (visible) {
    try {
      comboboxDropdownRef.value?.showPopover()
    } catch (e) {
      console.warn('Combobox dropdown show failed:', e)
    }
  } else {
    try {
      comboboxDropdownRef.value?.hidePopover()
    } catch (e) {
      console.warn('Combobox dropdown hide failed:', e)
    }
  }
})

let saveTimer: ReturnType<typeof setTimeout> | null = null
let toastTimer: ReturnType<typeof setTimeout> | null = null

const days = computed(() => config.value?.days ?? [])

const filteredEmails = computed(() => {
  const q = emailSearch.value.toLowerCase().trim()
  const list: string[] = config.value?.participants ?? []
  return q ? list.filter((e) => e.toLowerCase().includes(q)) : list
})

const daySeminars = computed(() =>
  (config.value?.seminars ?? []).filter((s) => s.day === selectedDay.value),
)

async function loadConfig() {
  config.value = await $fetch<Config>(`${apiBase}/api/config`)
  if (days.value.length) selectedDay.value = days.value[0]
}

async function selectEmail(email: string) {
  selectedEmail.value = email
  emailSearch.value = email
  dropdownOpen.value = false
  const ids = await $fetch<string[]>(
    `${apiBase}/api/bookings/${encodeURIComponent(email)}`,
  )
  selectedIds.value = new Set(ids)
}

function onBlur() {
  setTimeout(() => { dropdownOpen.value = false }, 150)
}

function pickFirstMatch() {
  if (filteredEmails.value.length) selectEmail(filteredEmails.value[0])
}

function toggleSeminar(id: string) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  selectedIds.value = next

  if (saveTimer) clearTimeout(saveTimer)
  if (toastTimer) clearTimeout(toastTimer)
  saveStatus.value = 'saving'

  saveTimer = setTimeout(async () => {
    try {
      await $fetch(
        `${apiBase}/api/bookings/${encodeURIComponent(selectedEmail.value)}`,
        { method: 'POST', body: [...selectedIds.value] },
      )
      saveStatus.value = 'saved'
    } catch {
      saveStatus.value = 'error'
    }
    toastTimer = setTimeout(() => { saveStatus.value = '' }, 2500)
  }, 400)
}

onMounted(loadConfig)
</script>

<style scoped>
.email-card {
  margin-bottom: 1.5rem;
}

.field-label {
  display: block;
  font-weight: 600;
  font-size: .9rem;
  margin-bottom: .5rem;
  color: var(--text);
}

.combobox-wrap {
  position: relative;
  max-width: 420px;
}

.combobox-input {
  anchor-name: --email-input;
  width: 100%;
  padding: .6rem .9rem;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  font-size: .95rem;
  outline: none;
  transition: border-color .15s;
  background: var(--bg);
}

.combobox-input:focus {
  border-color: var(--primary);
  background: #fff;
}

.combobox-list {
  /* Override browser popover defaults */
  position: absolute;
  inset: auto;
  margin: 0;
  border: none;
  background: #fff;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 8px 24px rgba(0,0,0,.1);
  max-height: 220px;
  overflow-y: auto;
  list-style: none;

  /* CSS Anchor Positioning relative to input */
  position-anchor: --email-input;
  top: anchor(bottom);
  left: anchor(left);
  width: anchor(width);
  margin-top: 4px;
}

@supports not (position-anchor: auto) {
  .combobox-list {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
  }
}

.combobox-item {
  padding: .55rem .9rem;
  cursor: pointer;
  font-size: .9rem;
  transition: background .1s;
}

.combobox-item:hover,
.combobox-item.is-selected {
  background: var(--primary-light);
  color: var(--primary);
}

.email-confirmed {
  margin-top: .75rem;
  font-size: .875rem;
  color: var(--muted);
}

/* Day tabs */
.day-tabs {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: .5rem;
  margin-bottom: 1.5rem;
}

.day-tab {
  position: relative;
  z-index: 1;
  padding: .45rem 1rem;
  border-radius: 999px;
  border: 1.5px solid var(--border);
  background: transparent;
  color: var(--muted);
  font-size: .9rem;
  font-weight: 500;
  transition: color .15s, border-color .15s;
}

.day-tab:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.day-tab.active {
  anchor-name: --active-day-tab;
  color: #fff;
  border-color: var(--primary);
}

/* Sliding active pill background */
.day-tabs::before {
  content: '';
  position: absolute;
  position-anchor: --active-day-tab;

  inset-block-start: anchor(top);
  inset-block-end: anchor(bottom);
  inset-inline-start: anchor(left);
  inset-inline-end: anchor(right);

  background: var(--primary);
  border-radius: 999px;
  z-index: 0;

  @media (prefers-reduced-motion: no-preference) {
    transition: inset 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }
}

/* Fallback for browsers that don't support anchor positioning */
@supports not (position-anchor: auto) {
  .day-tab.active {
    background: var(--primary);
    color: #fff;
  }
  .day-tabs::before {
    display: none;
  }
}

/* Seminar grid */
.seminars-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.seminar-card {
  background: var(--card);
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 1.1rem 1.25rem;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  transition: border-color .15s, box-shadow .15s;
}

.seminar-card.is-booked {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-light), var(--shadow);
}

.seminar-body {
  flex: 1;
  min-width: 0;
}

.seminar-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: .2rem;
}

.seminar-meta {
  font-size: .85rem;
  color: var(--muted);
}

.toggle-btn {
  flex-shrink: 0;
  padding: .4rem .9rem;
  border-radius: 999px;
  border: 1.5px solid var(--primary);
  background: transparent;
  color: var(--primary);
  font-size: .85rem;
  font-weight: 500;
  transition: all .15s;
  white-space: nowrap;
}

.toggle-btn:hover {
  background: var(--primary-light);
}

.toggle-btn.booked {
  background: var(--primary);
  color: #fff;
}

.toggle-btn.booked:hover {
  background: var(--primary-dark);
}

/* Toast */
.save-toast {
  position: fixed;
  inset: auto;
  bottom: 1.5rem;
  right: 1.5rem;
  margin: 0;
  padding: .65rem 1.2rem;
  border-radius: var(--radius);
  font-size: .9rem;
  font-weight: 500;
  box-shadow: 0 4px 12px rgba(0,0,0,.15);
  border: none;
  background: none;

  /* Modern native popover animations */
  transition: 
    opacity 0.3s ease,
    transform 0.3s ease,
    overlay 0.3s ease allow-discrete,
    display 0.3s ease allow-discrete;
  opacity: 0;
  transform: translateY(8px);
}

.save-toast:popover-open {
  opacity: 1;
  transform: translateY(0);
}

@starting-style {
  .save-toast:popover-open {
    opacity: 0;
    transform: translateY(8px);
  }
}

.toast-saving { background: #f1f5f9; color: var(--muted); border: 1px solid var(--border); }
.toast-saved  { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
.toast-error  { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
</style>
