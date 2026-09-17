module.exports = {
  content: ["./index.html"],
  theme: {
    extend: {
      colors: {
        gray: {
          100: 'rgb(var(--ui-ink-100) / <alpha-value>)',
          200: 'rgb(var(--ui-ink-200) / <alpha-value>)',
          300: 'rgb(var(--ui-ink-300) / <alpha-value>)',
          400: 'rgb(var(--ui-ink-400) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
}
