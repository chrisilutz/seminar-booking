<template>
  <div class="login-page">
    <div class="login-box card">
      <h1 class="login-title">Admin Login</h1>
      <p class="login-sub">Enter the admin password to continue.</p>

      <form class="login-form" @submit.prevent="login">
        <label class="field-label" for="password">Password</label>
        <input
          id="password"
          v-model="password"
          type="password"
          class="field-input"
          placeholder="••••••••"
          autocomplete="current-password"
          required
        />
        <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
        <button type="submit" class="btn login-btn" :disabled="loading">
          {{ loading ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
const { public: { apiBase } } = useRuntimeConfig()

const password = ref('')
const errorMsg = ref('')
const loading = ref(false)

async function login() {
  errorMsg.value = ''
  loading.value = true
  try {
    await $fetch(`${apiBase}/api/admin/login`, {
      method: 'POST',
      body: { password: password.value },
    })
    await navigateTo('/admin')
  } catch {
    errorMsg.value = 'Incorrect password. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: var(--bg);
}

.login-box {
  width: 100%;
  max-width: 380px;
  padding: 2rem;
}

.login-title {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: .25rem;
}

.login-sub {
  color: var(--muted);
  font-size: .9rem;
  margin-bottom: 1.5rem;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: .5rem;
}

.field-label {
  font-weight: 600;
  font-size: .875rem;
}

.field-input {
  padding: .6rem .9rem;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  font-size: .95rem;
  outline: none;
  transition: border-color .15s;
  width: 100%;
}

.field-input:focus {
  border-color: var(--primary);
}

.error-msg {
  color: var(--error);
  font-size: .875rem;
}

.login-btn {
  margin-top: .5rem;
  width: 100%;
  justify-content: center;
  padding: .65rem;
}

.login-btn:disabled {
  opacity: .6;
  cursor: not-allowed;
}
</style>
