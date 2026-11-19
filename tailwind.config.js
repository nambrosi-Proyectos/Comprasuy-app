/** @type {import('tailwindcss').Config} */

// Estética de la marca (igual que SVC, svc.comprasuy.com): naranja #ff7a1a, grises
// neutros (sin el tinte azul de "slate") y Figtree. Las pantallas heredadas usan clases
// slate/orange/blue/purple; redefinir esas paletas las alinea a la marca sin reescribirlas.
const brandOrange = {
	50: '#fff7f0',
	100: '#fff1e6',
	200: '#ffd9bd',
	300: '#ffbb8a',
	400: '#ff9a52',
	500: '#ff7a1a',
	600: '#e5620a',
	700: '#c04f06',
	800: '#993f08',
	900: '#7a340a',
	950: '#431a03',
};
const neutral = {
	50: '#fafafa',
	100: '#f6f6f6',
	200: '#ececec',
	300: '#dcdcdc',
	400: '#999999',
	500: '#666666',
	600: '#555555',
	700: '#444444',
	800: '#2e2e2e',
	900: '#1c1c1c',
	950: '#121212',
};

module.exports = {
	darkMode: ['class'],
	content: [
		'./pages/**/*.{js,jsx}',
		'./components/**/*.{js,jsx}',
		'./app/**/*.{js,jsx}',
		'./src/**/*.{js,jsx}',
	],
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px',
			},
		},
		extend: {
			fontFamily: {
				sans: ['Figtree', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
			},
			colors: {
				brand: { DEFAULT: '#ff7a1a', dark: '#e5620a', light: '#fff1e6' },
				ink: '#1c1c1c',
				orange: brandOrange,
				amber: brandOrange,
				purple: brandOrange,
				violet: brandOrange,
				indigo: brandOrange,
				slate: neutral,
				gray: neutral,
				blue: neutral,
				sky: neutral,
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))',
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))',
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))',
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))',
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))',
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))',
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))',
				},
			},
			borderRadius: {
				xl: '14px',
				'2xl': '18px',
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)',
			},
			keyframes: {
				'accordion-down': {
					from: { height: 0 },
					to: { height: 'var(--radix-accordion-content-height)' },
				},
				'accordion-up': {
					from: { height: 'var(--radix-accordion-content-height)' },
					to: { height: 0 },
				},
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
			},
		},
	},
	plugins: [require('tailwindcss-animate')],
};