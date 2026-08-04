/**
 * Design token configuration for FundedWealth Admin OS.
 * Premium fintech aesthetic inspired by Stripe, Linear, Vercel, and Supabase Studio.
 *
 * These TypeScript constants mirror the CSS custom properties defined in globals.css,
 * providing type-safe access to design tokens throughout the application.
 */

// -----------------------------------------------------------------------------
// Status Variants
// -----------------------------------------------------------------------------

/** All supported status values used across operating centers. */
export type StatusVariant =
  | 'active' | 'healthy' | 'approved' | 'completed' | 'online'          // green
  | 'pending' | 'under-review' | 'in-progress' | 'idle'                 // blue
  | 'warning' | 'degraded' | 'at-risk' | 'locked'                      // amber
  | 'critical' | 'failed' | 'breached' | 'rejected' | 'down' | 'sla-breached' // red
  | 'paused' | 'expired' | 'archived' | 'offline' | 'cancelled';        // gray

/** Color group each status maps to. */
export type StatusColorGroup = 'green' | 'blue' | 'amber' | 'red' | 'gray';

/** Maps each StatusVariant to its semantic color group. */
export const statusColorMap: Record<StatusVariant, StatusColorGroup> = {
  // Green — success / active / healthy
  active: 'green',
  healthy: 'green',
  approved: 'green',
  completed: 'green',
  online: 'green',
  // Blue — pending / in-progress / review
  pending: 'blue',
  'under-review': 'blue',
  'in-progress': 'blue',
  idle: 'blue',
  // Amber — warning / degraded / at-risk / locked
  warning: 'amber',
  degraded: 'amber',
  'at-risk': 'amber',
  locked: 'amber',
  // Red — critical / failed / breached
  critical: 'red',
  failed: 'red',
  breached: 'red',
  rejected: 'red',
  down: 'red',
  'sla-breached': 'red',
  // Gray — paused / expired / archived
  paused: 'gray',
  expired: 'gray',
  archived: 'gray',
  offline: 'gray',
  cancelled: 'gray',
} as const;

/** CSS color tokens per color group (references CSS custom properties). */
export const statusColors: Record<StatusColorGroup, { dot: string; bg: string; text: string }> = {
  green: { dot: 'bg-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-500' },
  blue: { dot: 'bg-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-500' },
  amber: { dot: 'bg-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-500' },
  red: { dot: 'bg-red-500', bg: 'bg-red-500/10', text: 'text-red-500' },
  gray: { dot: 'bg-zinc-400', bg: 'bg-zinc-400/10', text: 'text-zinc-400' },
} as const;

// -----------------------------------------------------------------------------
// Density
// -----------------------------------------------------------------------------

/** Table density levels. */
export type Density = 'compact' | 'default' | 'comfortable';

/** Row height in pixels for each density level. */
export const rowHeight: Record<Density, number> = {
  compact: 36,
  default: 44,
  comfortable: 52,
} as const;

/** CSS variable names for row heights. */
export const rowHeightVar: Record<Density, string> = {
  compact: 'var(--table-row-compact)',
  default: 'var(--table-row-default)',
  comfortable: 'var(--table-row-comfortable)',
} as const;

// -----------------------------------------------------------------------------
// Typography Scale
// -----------------------------------------------------------------------------

/**
 * Typography scale constants matching the CSS custom properties.
 * Each entry defines weight, size (px), and line-height.
 */
export const typography = {
  display: { weight: 600, size: 24, lineHeight: 1.2, className: 'text-2xl font-semibold leading-tight' },
  heading: { weight: 600, size: 18, lineHeight: 1.3, className: 'text-lg font-semibold leading-snug' },
  subheading: { weight: 500, size: 14, lineHeight: 1.4, className: 'text-sm font-medium leading-normal' },
  body: { weight: 400, size: 13, lineHeight: 1.5, className: 'text-[13px] font-normal leading-relaxed' },
  caption: { weight: 400, size: 11, lineHeight: 1.4, className: 'text-[11px] font-normal leading-snug' },
  mono: { weight: 400, size: 12, lineHeight: 1.5, className: 'text-xs font-normal font-mono leading-relaxed' },
} as const;

// -----------------------------------------------------------------------------
// Layout Dimensions
// -----------------------------------------------------------------------------

/** Layout dimension constants (in pixels) for the Mission Control three-panel architecture. */
export const layout = {
  /** Left navigation panel width (expanded). */
  navWidth: 240,
  /** Left navigation panel width (collapsed, icon-only). */
  navCollapsed: 64,
  /** Right Operations Feed panel width. */
  feedWidth: 340,
  /** Top bar height. */
  topbarHeight: 48,
  /** Minimum center content width. */
  centerMinWidth: 800,
  /** Maximum page horizontal padding. */
  maxPagePadding: 24,
  /** Maximum card internal padding. */
  maxCardPadding: 16,
  /** Maximum gutter between panels. */
  maxGutter: 16,
} as const;

// -----------------------------------------------------------------------------
// Spacing Scale
// -----------------------------------------------------------------------------

/** Spacing scale based on 4px base unit. Values in pixels. */
export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 32,
  8: 48,
} as const;

/** Spacing scale as CSS-ready rem strings. */
export const spacingRem = {
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  7: '2rem',
  8: '3rem',
} as const;

// -----------------------------------------------------------------------------
// Color Semantic Mappings
// -----------------------------------------------------------------------------

/** Semantic color tokens mapping to CSS custom properties defined in globals.css. */
export const colors = {
  background: 'hsl(var(--color-background))',
  surface: 'hsl(var(--color-surface))',
  surfaceRaised: 'hsl(var(--color-surface-raised))',
  border: 'hsl(var(--color-border))',
  borderSubtle: 'hsl(var(--color-border-subtle))',
  textPrimary: 'hsl(var(--color-text-primary))',
  textSecondary: 'hsl(var(--color-text-secondary))',
  textMuted: 'hsl(var(--color-text-muted))',
  accent: 'hsl(var(--color-accent))',
  success: 'hsl(var(--color-success))',
  warning: 'hsl(var(--color-warning))',
  critical: 'hsl(var(--color-critical))',
  info: 'hsl(var(--color-info))',
} as const;

// -----------------------------------------------------------------------------
// Elevation
// -----------------------------------------------------------------------------

/** Elevation (box-shadow) levels. */
export const elevation = {
  flat: 'none',
  raised: '0 1px 3px rgba(0,0,0,0.12)',
  overlay: '0 8px 24px rgba(0,0,0,0.24)',
} as const;

// -----------------------------------------------------------------------------
// Legacy-compatible export (preserves backward compatibility)
// -----------------------------------------------------------------------------

export const designTokens = {
  spacing: {
    page: '1.5rem',
    section: '1.5rem',
    card: '1rem',
    element: '1rem',
    tight: '0.5rem',
  },
  typography: {
    heading1: 'text-2xl font-semibold tracking-tight',
    heading2: 'text-lg font-semibold tracking-tight',
    heading3: 'text-sm font-medium',
    heading4: 'text-[13px] font-medium',
    body: 'text-[13px]',
    caption: 'text-[11px] text-muted-foreground',
    label: 'text-sm font-medium',
  },
  elevation: {
    card: 'shadow-sm',
    dropdown: 'shadow-md',
    modal: 'shadow-lg',
    tooltip: 'shadow-sm',
  },
  breakpoints: {
    min: 1280,
    max: 2560,
    sidebar: 240,
  },
} as const;
