'use client';

import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { CommandPalette } from '@/components/layout/command-palette';
import { OperationsCopilot } from '@/components/shared/operations-copilot';
import { OperationsFeed } from '@/components/layout/operations-feed';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { LayoutProvider, useLayout } from '@/hooks/use-layout';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LayoutProvider>
      <MissionControlLayout>{children}</MissionControlLayout>
    </LayoutProvider>
  );
}

function MissionControlLayout({ children }: { children: React.ReactNode }) {
  const { navCollapsed, feedVisible, feedMode } = useLayout();

  // Register global keyboard shortcuts (G+U, Ctrl+I, etc.)
  useKeyboardShortcuts();

  // Determine grid template columns based on state
  const navWidth = navCollapsed ? '64px' : '240px';
  // In overlay mode, feed doesn't occupy grid space — it floats over content
  const feedGridWidth = feedMode === 'panel' && feedVisible ? '340px' : '0px';

  return (
    <>
      <div
        className="relative min-h-screen grid"
        style={{
          gridTemplateColumns: `${navWidth} minmax(800px, 1fr) ${feedGridWidth}`,
          gap: '0px',
        }}
      >
        {/* Left Nav Panel */}
        <aside
          className="sticky top-0 h-screen overflow-hidden transition-[width] duration-200 ease-in-out"
          style={{ width: navWidth }}
        >
          <Sidebar className="h-full" />
        </aside>

        {/* Center Content */}
        <div className="flex flex-col min-w-0">
          <Header />
          <main className="flex-1 overflow-auto p-5">
            {children}
          </main>
        </div>

        {/* Right Operations Feed Panel — inline in grid on /executive, overlay elsewhere */}
        {feedMode === 'panel' && (
          <aside
            className={`
              sticky top-0 h-screen overflow-hidden border-l bg-background
              transition-[width,opacity] duration-200 ease-in-out
              ${feedVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}
            `}
            style={{ width: feedVisible ? '340px' : '0px' }}
            aria-label="Operations Feed"
          >
            {feedVisible && <OperationsFeed />}
          </aside>
        )}
      </div>

      {/* Overlay feed for non-executive pages */}
      {feedMode === 'overlay' && feedVisible && (
        <aside
          className="fixed top-0 right-0 z-30 h-screen w-[340px] border-l bg-background shadow-xl transition-transform duration-200 ease-in-out"
          aria-label="Operations Feed"
        >
          <OperationsFeed />
        </aside>
      )}

      {/* Command Palette (Ctrl+K) */}
      <CommandPalette />

      {/* AI Operations Copilot (Ctrl+J) */}
      <OperationsCopilot />
    </>
  );
}

