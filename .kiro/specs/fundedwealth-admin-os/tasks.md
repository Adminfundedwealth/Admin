# Implementation Plan: FundedWealth Admin OS — UI/UX Transformation

## Overview

This plan transforms the existing FundedWealth Admin OS from a generic SaaS dashboard into a premium enterprise operations center. The transformation is purely visual/interactive — no database schema changes, no new business logic, no RBAC modifications. Implementation follows a 6-layer progressive approach where each layer builds on the previous, ensuring no existing functionality breaks.

## Tasks

- [x] 1. Layer 1 — Design Token System
  - [x] 1.1 Extend globals.css with premium fintech design tokens
    - Add semantic color scale variables (surface, surface-raised, border-subtle, text-primary, text-secondary, text-muted, accent, success, warning, critical, info)
    - Add spacing scale (--space-1 through --space-8)
    - Add typography scale (--font-display, --font-heading, --font-subheading, --font-body, --font-caption, --font-mono)
    - Add elevation scale (--elevation-flat, --elevation-raised, --elevation-overlay)
    - Add layout tokens (--nav-width, --nav-collapsed, --feed-width, --topbar-height, --table-row-compact, --table-row-default, --table-row-comfortable)
    - Preserve all existing CSS variables for backward compatibility
    - _Requirements: 26.1, 26.2, 26.3, 26.4_

  - [x] 1.2 Create theme configuration file at src/config/theme.ts
    - Export TypeScript constants for all design token values
    - Define StatusVariant type and color mappings
    - Define Density type and row height mappings
    - Define typography scale constants
    - Export layout dimension constants
    - _Requirements: 26.1, 26.4, 26.5_

  - [x] 1.3 Add global typography and table base styles to globals.css
    - Add font-variant-numeric: tabular-nums utility class
    - Add compact row height classes (.row-compact, .row-default, .row-comfortable)
    - Add right-align numeric column utility
    - Ensure body uses 13px base font, antialiased rendering
    - Set max padding constraints (24px page horizontal, 16px card)
    - _Requirements: 26.3, 26.4, 26.5_

- [x] 2. Layer 2 — Mission Control Layout
  - [x] 2.1 Create use-layout hook at src/hooks/use-layout.ts
    - Implement LayoutState context with navCollapsed, feedVisible, feedMode
    - Persist navCollapsed and feedVisible to localStorage
    - Provide toggleNav() and toggleFeed() actions
    - Auto-detect Executive Command Center route for feedMode='panel' vs 'overlay'
    - _Requirements: 27.1, 27.4, 27.5_

  - [x] 2.2 Upgrade src/app/(dashboard)/layout.tsx to Mission Control Layout
    - Wrap existing layout with LayoutProvider context
    - Implement three-panel CSS Grid: left nav (240px/64px) | center (fluid, min 800px) | right feed (340px/0)
    - Left nav stays fixed during vertical scroll
    - Right panel visible by default on /executive route, hidden elsewhere
    - Zero decorative whitespace between panels (max 16px gutters)
    - Integrate existing Sidebar, Header, CommandPalette components
    - _Requirements: 27.1, 27.2, 27.3, 27.4, 27.5, 27.6, 27.7_

  - [x] 2.3 Enhance src/components/layout/sidebar.tsx for collapsible icon-only mode
    - Support collapsed state (64px width) showing only icons
    - Animate transition between expanded and collapsed
    - Keep sidebar fixed during vertical scroll
    - Maintain existing navigation structure and RBAC badge rendering
    - _Requirements: 27.3, 27.5_

  - [x] 2.4 Enhance src/components/layout/header.tsx as persistent 48px top bar
    - Constrain height to 48px, position: sticky top-0
    - Add: FW logo, search trigger, copilot trigger button (Ctrl+J), notifications bell, connection status dot, feed toggle button, staff avatar
    - Add non-blocking progress indicator for background operations
    - _Requirements: 37.7, 37.8, 38.1_

- [x] 3. Checkpoint — Verify layout renders correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Layer 3 — Shared Components
  - [x] 4.1 Create StatusBadge component at src/components/shared/status-badge.tsx
    - Implement StatusVariant type with all defined status values
    - Render pill-shaped badge: 6px colored dot + sentence-case label + 10% opacity background + full-intensity text
    - Map statuses to colors: green (active/healthy/approved/completed/online), blue (pending/under-review/in-progress/idle), amber (warning/degraded/at-risk), red (critical/failed/breached/rejected/down/sla-breached), gray (paused/expired/archived/offline/cancelled)
    - Support size prop (sm/md) and animate prop (150ms color fade)
    - Default unknown statuses to gray with console.warn
    - _Requirements: 36.1, 36.2, 36.3, 36.4, 36.5_

  - [x] 4.2 Create QueueCard component at src/components/shared/queue-card.tsx
    - Accept props: name, count, oldestAge, averageWait, priorityBreakdown, warningThreshold, criticalThreshold, href
    - Max height 120px, display count prominently
    - Amber border when count > warningThreshold, red when > criticalThreshold
    - Show priority breakdown (critical/high/medium/low counts)
    - Click navigates to href (operating center with pending filter)
    - _Requirements: 29.1, 29.2, 29.3, 29.4, 29.6_

  - [x] 4.3 Create DensityControl component at src/components/shared/density-control.tsx
    - Three-segment toggle: compact (36px), default (44px), comfortable (52px)
    - Accept tableId prop for localStorage persistence key
    - Persist selection per table in localStorage as density-{tableId}
    - Export useDensity hook for reading density preference
    - _Requirements: 33.3_

  - [x] 4.4 Create KPICard component at src/components/shared/kpi-card.tsx
    - Display: current value (display typography), delta (absolute change), percentage change, trend arrow (up/down/neutral)
    - Color-code deltas: green for positive growth, red for decline, gray for <1% change
    - Include sparkline area (60px height x 120px width) showing last 7 data points
    - Support currency formatting (configurable locale)
    - _Requirements: 32.1, 32.2, 32.3, 32.5, 32.6_

  - [x] 4.5 Create OperationsFeed component at src/components/layout/operations-feed.tsx
    - Display chronological event stream (50 most recent, infinite scroll +25 batches)
    - Show per event: type icon, description (max 80 chars), actor, relative timestamp, severity color
    - Connection status dot at top (green/red)
    - Filter toggle chips by category (registrations, purchases, payouts, KYC, risk, support, staff)
    - Subscribe to Supabase Realtime channel for live events
    - Auto-reconnect every 5s on disconnect with backfill
    - Clicking an event navigates to entity detail
    - _Requirements: 28.1, 28.2, 28.3, 28.4, 28.5, 28.6, 28.7_

  - [x] 4.6 Create use-realtime-feed hook at src/hooks/use-realtime-feed.ts
    - Subscribe to operations_events Supabase Realtime channel
    - Manage connection state (connected/disconnected)
    - Handle auto-reconnect with 5s interval
    - Backfill missed events on reconnection
    - Expose events array, connectionStatus, and filter state
    - _Requirements: 28.2, 28.6, 28.7_

- [x] 5. Checkpoint — Verify shared components render in isolation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Layer 4 — Enhanced Data Table
  - [x] 6.1 Create use-table-preferences hook at src/hooks/use-table-preferences.ts
    - Manage density, visibleColumns, and savedFilters per tableId
    - Read/write localStorage with fallback to defaults
    - Handle localStorage quota exceeded gracefully
    - Support max 10 saved filter presets per table
    - Validate minimum 3 visible columns
    - _Requirements: 33.3, 33.4, 33.5_

  - [x] 6.2 Enhance DataTable with sticky headers and record count
    - Add position: sticky; top: 0; z-index: 10 to thead
    - Add "Showing X of Y total records" display above table
    - Apply font-variant-numeric: tabular-nums on numeric columns
    - Right-align numeric columns
    - Apply density-based row heights from CSS variables
    - _Requirements: 33.1, 33.7, 26.5_

  - [x] 6.3 Add hover row actions to DataTable
    - Accept hoverActions prop: (row) => ActionItem[]
    - Show 2-3 inline action buttons at row right edge on hover
    - Buttons appear with opacity transition, disappear on mouse leave
    - Each action button respects RBAC via permission prop
    - _Requirements: 33.2_

  - [x] 6.4 Add column visibility controls to DataTable
    - Add dropdown/popover for toggling column visibility
    - Persist visible columns per tableId in localStorage
    - Enforce minimum 3 visible columns
    - _Requirements: 33.4_

  - [x] 6.5 Add saved filters and active filter tags to DataTable
    - Display active filter tags above table with individual remove + "Clear all"
    - Save/load named filter presets (name, filters, sortOrder)
    - Max 10 presets per table, stored in localStorage
    - Remove stale filters referencing deleted columns gracefully
    - _Requirements: 33.5, 33.6_

  - [x] 6.6 Add context menu (right-click) to DataTable rows
    - Accept contextMenuActions prop: (row) => ActionItem[]
    - Show custom context menu on right-click with all available actions
    - RBAC check per action item
    - _Requirements: 33.8_

  - [x] 6.7 Integrate DensityControl into DataTable toolbar
    - Add DensityControl toggle in table toolbar area
    - Wire density selection to row height CSS variables
    - Persist per-table preference
    - _Requirements: 33.3_

- [x] 7. Checkpoint — Verify enhanced tables render with all features
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Layer 4b — Enhanced Slide-Over Panel
  - [x] 8.1 Enhance SlidePanel with keyboard navigation and entity context
    - Add arrow key navigation (up/down to prev/next entity)
    - Add onNavigate callback for entity switching without closing
    - Set width to 40-50% viewport (min 480px, max 720px)
    - Add "Open Full View" link with fullViewHref prop
    - Display timeline of last 10 events for entity
    - Add context-sensitive action buttons
    - Maintain 200ms slide animation
    - Keep Escape to close
    - _Requirements: 34.1, 34.2, 34.3, 34.4, 34.5, 34.6, 34.7_

  - [x] 8.2 Wire DataTable row clicks to open SlidePanel
    - Add onRowClick prop to DataTable
    - Clicking a row opens SlidePanel with entity data
    - Underlying table remains visible and scrollable
    - Action execution in panel updates both panel and table row
    - _Requirements: 34.1, 34.4_

- [x] 9. Layer 5 — AI Operations Copilot
  - [x] 9.1 Create copilot API route at src/app/api/copilot/query/route.ts
    - Accept POST with { query, context }
    - Implement intent parser: classify query as data/navigation/report
    - Parse entity types, time ranges, and action verbs from natural language
    - Execute Supabase RPC queries with RLS enforcement (RBAC via session)
    - Return structured response: { type, content, structuredData, entityRefs, navigation }
    - Log query/response to audit system
    - Handle errors: timeout (5s), permission denied, unrecognized query
    - _Requirements: 38.3, 38.4, 38.5, 38.6, 38.7, 38.14_

  - [x] 9.2 Create use-copilot hook at src/hooks/use-copilot.ts
    - Manage copilot state: open, messages[], isProcessing, suggestedChips, pinnedResponses
    - Handle Ctrl+J / Cmd+J keyboard shortcut to toggle panel
    - Submit queries to /api/copilot/query
    - Retain context for 10 consecutive exchanges
    - Clear context on panel close
    - Support pin/unpin responses (max 3)
    - _Requirements: 38.1, 38.9, 38.15_

  - [x] 9.3 Create OperationsCopilot panel at src/components/shared/operations-copilot.tsx
    - Right-side slide-over panel (400-480px width)
    - Header: "Operations Copilot" + connection status indicator
    - Response area: render structured data (tables max 10 rows, metric cards, bullet lists)
    - Entity references as clickable links
    - Linear progress bar at top during processing (no animated dots)
    - Input field at bottom with submit on Enter
    - Suggested quick-action chips (role-aware) when idle
    - Match design system tokens (dark theme, typography, spacing)
    - NO chat bubbles, NO avatar icons, NO typing indicators
    - _Requirements: 38.2, 38.8, 38.10, 38.11, 38.12, 38.13_

  - [x] 9.4 Integrate copilot trigger into top bar header
    - Add copilot button in header between search and notifications
    - Wire Ctrl+J / Cmd+J shortcut
    - Show copilot panel as overlay on right side
    - _Requirements: 38.1, 37.7_

- [x] 10. Checkpoint — Verify copilot panel opens, submits queries, renders responses
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Layer 6 — Executive Command Center Polish
  - [x] 11.1 Redesign src/app/(dashboard)/executive/page.tsx as one-screen command center
    - Organize into sections: Revenue Health (top row), Operational Queues (second row), Risk Health (third row), Staff Presence (inline section), System Health (bottom row)
    - Revenue Health: 4 KPICards in horizontal row (max 100px height) — revenue today, revenue MTD, active traders, active funded accounts — each with deltas
    - Comparison period selector: vs yesterday / previous week / previous month / same day last month
    - Progressive skeleton loading per section (not blocking entire page)
    - Refresh all KPIs every 30 seconds without page reload
    - _Requirements: 35.1, 35.2, 35.4, 35.6, 35.7, 32.1, 32.2, 32.3, 32.4_

  - [x] 11.2 Add Queue Cards section to Executive Command Center
    - Display 4 QueueCards horizontally: Pending Payouts, Pending KYC, Open Tickets, Risk Alerts
    - Equal width distribution, max 120px height per card
    - Wire counts to Supabase realtime (update within 10s)
    - Click navigates to corresponding operating center with pending filter
    - _Requirements: 35.3, 29.1, 29.2, 29.3, 29.4, 29.5, 29.6_

  - [x] 11.3 Add Risk Health section to Executive Command Center
    - Display: total accounts at risk, highest severity alert, capital exposure ratio, breach count today
    - Use compact KPICard format matching Revenue Health
    - Color-coded exposure: green <5%, amber 5-15%, red >15%
    - _Requirements: 35.4_

  - [x] 11.4 Add Staff Presence section to Executive Command Center
    - Show online/idle staff members sorted by status then recency
    - Display: avatar/initials, name, current module, time since last activity
    - Compact header: online count / idle count / offline count
    - Max height 200px with internal scrolling
    - Subscribe to Supabase Realtime staff-presence channel
    - _Requirements: 30.1, 30.2, 30.3, 30.4, 30.5, 30.6_

  - [x] 11.5 Add System Health compact row to Executive Command Center
    - Show each monitored service as colored dot (green/amber/red) + name
    - Single row, max 48px height
    - _Requirements: 35.5_

- [x] 12. Layer 6b — Risk Management Center Visualization
  - [x] 12.1 Add risk heatmap visualization to src/app/(dashboard)/risk/page.tsx
    - Heatmap grid: account size tier (x-axis) vs drawdown usage % (y-axis)
    - Cell color: green (0 at risk) → amber (1-5) → red (6+)
    - Use Recharts or custom SVG grid
    - _Requirements: 31.1_

  - [x] 12.2 Add severity color bars and risk score indicators to risk alerts table
    - Left-edge color bar per row (4px width): green=low, amber=medium, orange=high, red=critical
    - Risk score as circular progress indicator (0-100) with color thresholds
    - Pulse animation (200ms) on new breach events
    - _Requirements: 31.2, 31.3, 31.4_

  - [x] 12.3 Add capital exposure metric bar to risk page
    - Prominent display: total capital at risk, total deployed, exposure ratio %
    - Color coded: green <5%, amber 5-15%, red >15%
    - Breach indicators (icon + red text) on affected rows
    - _Requirements: 31.5, 31.6_

- [x] 13. Layer 6c — Interaction Patterns and Keyboard Navigation
  - [x] 13.1 Enhance keyboard shortcuts in use-keyboard-shortcuts.ts
    - Ensure: Ctrl+K/Cmd+K (search), Escape (close panels/modals), Arrow keys (table/panel nav), Enter (open selected row), number keys 1-9 (switch nav sections)
    - Add Ctrl+J/Cmd+J (copilot) if not already wired
    - _Requirements: 37.1_

  - [x] 13.2 Add optimistic UI feedback for state-changing actions
    - Immediate visual feedback (<100ms) on approve/reject/escalate button clicks
    - Button state change and inline status update before server confirmation
    - Revert to server-confirmed state within 2s if server rejects
    - _Requirements: 37.2_

  - [x] 13.3 Add relative timestamp formatting utility
    - Display timestamps as "2m ago", "1h ago", "3d ago" by default
    - Hover tooltip shows full UTC ISO 8601 timestamp
    - Use across all operating centers
    - _Requirements: 37.4_

  - [x] 13.4 Enhance notification badges on navigation items
    - Compact red dot for counts 1-9, red badge with number for 10+
    - Position at top-right of nav icon
    - Update every 60s via existing badge query system
    - _Requirements: 37.6_

- [x] 14. Final Checkpoint — Full integration verification
  - Ensure all tests pass, ask the user if questions arise.

- [ ]* 15. Unit tests for shared components
  - [ ]* 15.1 Write unit tests for StatusBadge component
    - Test correct color mapping for each variant
    - Test fallback to gray for unknown statuses
    - Test animate prop applies 150ms transition class
    - Test size prop renders sm/md variants
    - _Requirements: 36.1, 36.2, 36.4, 36.5_

  - [ ]* 15.2 Write unit tests for QueueCard component
    - Test amber border at warning threshold
    - Test red border at critical threshold
    - Test click navigates to href
    - Test count and priority breakdown display
    - _Requirements: 29.2, 29.3, 29.4_

  - [ ]* 15.3 Write unit tests for DensityControl component
    - Test toggle between 3 density states
    - Test localStorage persistence per tableId
    - Test correct CSS variable application
    - _Requirements: 33.3_

  - [ ]* 15.4 Write unit tests for KPICard component
    - Test delta color coding (green/red/gray)
    - Test trend arrow direction
    - Test sparkline rendering
    - _Requirements: 32.1, 32.2_

  - [ ]* 15.5 Write unit tests for OperationsFeed component
    - Test event rendering with correct structure
    - Test filter toggle chips
    - Test connection status dot display
    - _Requirements: 28.1, 28.5, 28.6_

  - [ ]* 15.6 Write unit tests for enhanced DataTable features
    - Test sticky header rendering
    - Test hover action visibility on hover/leave
    - Test column visibility minimum 3 enforcement
    - Test saved filter CRUD (save/load/delete)
    - Test record count display
    - _Requirements: 33.1, 33.2, 33.4, 33.5, 33.7_

  - [ ]* 15.7 Write unit tests for OperationsCopilot panel
    - Test query submission flow
    - Test structured response rendering (tables, metrics, lists)
    - Test entity link clicks
    - Test suggested chips display
    - Test linear progress bar during processing
    - _Requirements: 38.2, 38.8, 38.10, 38.11, 38.13_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation between layers
- The design document has no Correctness Properties section — this is a UI/UX transformation that doesn't benefit from property-based testing
- All existing business logic (auth, RBAC, audit, database) remains untouched
- The transformation builds progressively: tokens → layout → components → tables → copilot → per-page polish
- localStorage is used for all preference persistence (no new DB tables)
- Existing shadcn/ui components and @tanstack/react-table are enhanced in-place, not replaced

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4"] },
    { "id": 4, "tasks": ["4.1", "4.2", "4.3", "4.4", "4.6"] },
    { "id": 5, "tasks": ["4.5", "6.1"] },
    { "id": 6, "tasks": ["6.2", "6.3", "6.4", "6.7"] },
    { "id": 7, "tasks": ["6.5", "6.6", "8.1"] },
    { "id": 8, "tasks": ["8.2", "9.1", "9.2"] },
    { "id": 9, "tasks": ["9.3"] },
    { "id": 10, "tasks": ["9.4", "13.1", "13.3"] },
    { "id": 11, "tasks": ["11.1", "11.4", "11.5", "13.2", "13.4"] },
    { "id": 12, "tasks": ["11.2", "11.3", "12.1"] },
    { "id": 13, "tasks": ["12.2", "12.3"] },
    { "id": 14, "tasks": ["15.1", "15.2", "15.3", "15.4", "15.5", "15.6", "15.7"] }
  ]
}
```
