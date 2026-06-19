/**
 * Design token configuration for FundedWealth Admin OS.
 * These tokens are referenced in tailwind.config.ts via CSS variables.
 */

export const designTokens = {
  spacing: {
    page: '1.5rem',    // 24px - main content padding
    section: '1.5rem', // 24px - between major sections
    card: '1.5rem',    // 24px - card internal padding
    element: '1rem',   // 16px - between elements
    tight: '0.5rem',   // 8px - tight spacing
  },
  typography: {
    heading1: 'text-3xl font-bold tracking-tight',
    heading2: 'text-2xl font-semibold tracking-tight',
    heading3: 'text-xl font-semibold',
    heading4: 'text-lg font-medium',
    body: 'text-sm',
    caption: 'text-xs text-muted-foreground',
    label: 'text-sm font-medium',
  },
  elevation: {
    card: 'shadow-sm',
    dropdown: 'shadow-md',
    modal: 'shadow-lg',
    tooltip: 'shadow-sm',
  },
  breakpoints: {
    min: 1280,   // Minimum supported viewport
    max: 2560,   // Maximum design target
    sidebar: 256, // Sidebar width in px
  },
} as const;
