export default defineNuxtConfig({
  future: { compatibilityVersion: 4 },
  compatibilityDate: '2024-11-01',
  ssr: false,
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      apiBase: '',
    },
  },
})
