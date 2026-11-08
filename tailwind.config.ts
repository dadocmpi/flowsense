import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      // ── Type scale ─────────────────────────────────────────────────────
      // One semantic scale for the whole app. Panels must pick a role, not a
      // one-off pixel size, so text of the same importance is the same size
      // everywhere:
      //   text-data      numeric readouts / prices        (most important data)
      //   text-data-lg   the hero numeric readout (price)
      //   text-headline  the compass verdict word
      //   text-title     section / pane titles
      //   text-body      default body copy and list rows
      //   text-label     secondary labels and captions
      //   text-micro     table headers and fine print
      fontSize: {
        micro: ['0.6875rem', { lineHeight: '1rem' }],
        label: ['0.75rem', { lineHeight: '1.05rem' }],
        body: ['0.875rem', { lineHeight: '1.3rem' }],
        title: ['1rem', { lineHeight: '1.45rem' }],
        data: ['1.125rem', { lineHeight: '1.6rem' }],
        'data-lg': ['2rem', { lineHeight: '1.1' }],
        headline: ['2.5rem', { lineHeight: '1' }],
      },
      // ── Spacing scale ──────────────────────────────────────────────────
      // Panels share these so gutters never drift apart section to section:
      //   gap-panel    space between top-level panels
      //   p-panel      panel interior padding (panel-pad-lg wider screens)
      //   gap-block    space between blocks inside a panel
      //   gap-field    space between label/value rows
      spacing: {
        panel: '1.25rem',
        'panel-lg': '1.75rem',
        block: '1.5rem',
        field: '0.5rem',
      },
      fontFamily: {
        // Inter for text, IBM Plex Mono for every number. Both are free and
        // loaded from Google Fonts; the system stacks are the fallback.
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        // ── Institutional terminal palette ────────────────────────────────
        // Three graphite surfaces, one hairline, muted direction colours. No
        // neon, no gradients. Green/red carry direction ONLY; amber is warning
        // ONLY; `accent` is the single restrained highlight (selection, focus).
        base: {
          0: '#0a0b0d', // page
          1: '#101215', // panel
          2: '#16181c', // raised / inset
          3: '#1d2025', // hover
        },
        line: '#23262c', // 1px hairline borders
        ink: {
          DEFAULT: '#e7e9ee',
          muted: '#9aa2ae',
          subtle: '#697180',
        },
        pos: { DEFAULT: '#3fb950', muted: '#2ea043' },
        neg: { DEFAULT: '#f85149', muted: '#da3633' },
        warn: { DEFAULT: '#d29922', muted: '#bb8009' },
        accent: { DEFAULT: '#5b8def', muted: '#3f6fd8' },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
