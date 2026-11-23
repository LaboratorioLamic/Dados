// Configuração do Tailwind (paleta institucional, fontes e sombras)

tailwind.config = {
    theme: {
        extend: {
            fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
            colors: {
                /* Paleta institucional — base #0e1628 */
                navy: {
                    50:  '#eef1f7',
                    100: '#d6dcea',
                    200: '#aab5d0',
                    300: '#7385ad',
                    400: '#465a86',
                    500: '#293a63',
                    600: '#1c2a4b',
                    700: '#16203a',
                    800: '#111a2e',
                    900: '#0e1628',
                    950: '#080d18'
                },
                /* Azul de destaque calibrado sobre o navy */
                blue: {
                    50:  '#eff5ff',
                    100: '#dbe8fe',
                    200: '#bdd5fd',
                    300: '#93bafc',
                    400: '#6a9cf9',
                    500: '#3d7cf0',
                    600: '#2761da',
                    700: '#1e4db1',
                    800: '#1b418c',
                    900: '#183770'
                }
            },
            boxShadow: {
                card: '0 1px 2px rgba(14,22,40,.04), 0 8px 24px -12px rgba(14,22,40,.18)',
                elevated: '0 2px 4px rgba(14,22,40,.05), 0 18px 40px -18px rgba(14,22,40,.35)',
                drawer: '-24px 0 60px -20px rgba(8,13,24,.55)'
            }
        }
    }
}
