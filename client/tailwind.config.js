/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      boxShadow: {
        panel: "0 18px 50px rgba(0, 0, 0, 0.25)",
        glow: "0 0 0 1px rgba(52, 211, 153, .28), 0 20px 46px rgba(0, 0, 0, .38)",
      },
    },
  },
  plugins: [],
};
