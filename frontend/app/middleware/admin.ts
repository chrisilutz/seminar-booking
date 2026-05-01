export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/admin/login') return

  const { public: { apiBase } } = useRuntimeConfig()

  try {
    const data = await $fetch<{ authenticated: boolean }>(`${apiBase}/api/admin/me`)
    if (!data.authenticated) {
      return navigateTo('/admin/login')
    }
  } catch {
    return navigateTo('/admin/login')
  }
})
