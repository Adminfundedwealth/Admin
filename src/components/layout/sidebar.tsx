'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { sidebarNavigation } from '@/config/navigation';
import { StaffPresence } from '@/components/shared/staff-presence';
import { useRecentItems, useFavorites } from '@/hooks/use-recent-items';
import { useLayout } from '@/hooks/use-layout';
import {
  LayoutDashboard, Users, Trophy, TrendingUp, Wallet, BarChart3,
  ShieldCheck, AlertTriangle, FileText, Activity, ListOrdered,
  Link as LinkIcon, Megaphone, Headphones, Award, Monitor, UserCog, Settings,
  ShoppingCart, CreditCard, Trash2, SlidersHorizontal, Tag,
  Star, Clock, ChevronsLeft, ChevronsRight,
  Zap, Layers, History, Shield,
} from 'lucide-react';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Users, Trophy, TrendingUp, Wallet, BarChart3,
  ShieldCheck, AlertTriangle, FileText, Activity, ListOrdered,
  Link: LinkIcon, Megaphone, Headphones, Award, Monitor, UserCog, Settings,
  ShoppingCart, CreditCard, Trash2, SlidersHorizontal, Tag,
  Zap, Layers, History, Shield,
};

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();
  const { recentItems } = useRecentItems();
  const { favorites } = useFavorites();
  const { navCollapsed, toggleNav } = useLayout();

  return (
    <aside
      className={cn(
        'border-r bg-sidebar/50 flex flex-col h-screen sticky top-0 overflow-y-auto transition-[width] duration-200 ease-in-out',
        navCollapsed ? 'w-[var(--nav-collapsed)]' : 'w-[var(--nav-width)]',
        className
      )}
    >
      {/* Logo */}
      <div className="h-12 flex items-center px-4 border-b shrink-0">
        <div className="flex items-center gap-2">
          <img
            src="/logo.png"
            alt="FundedWealth Logo"
            width={24}
            height={24}
            className="h-6 w-6 shrink-0"
          />
          {!navCollapsed && (
            <div>
              <p className="text-xs font-bold leading-none">FundedWealth</p>
              <p className="text-[9px] text-muted-foreground leading-none mt-0.5">Admin OS</p>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 px-2 space-y-4 overflow-y-auto" aria-label="Main navigation">
        {sidebarNavigation.map((section) => (
          <div key={section.label}>
            {!navCollapsed && (
              <h2 className="px-2 mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                {section.label}
              </h2>
            )}
            <ul className="space-y-px">
              {section.items.map((item) => {
                const Icon = iconMap[item.icon];
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={navCollapsed ? item.label : undefined}
                      className={cn(
                        'flex items-center gap-2.5 px-2 py-1.5 text-[13px] rounded-md transition-all duration-100',
                        navCollapsed && 'justify-center px-0',
                        isActive
                          ? 'bg-accent text-accent-foreground font-medium'
                          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                      )}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
                      {!navCollapsed && (
                        <>
                          <span className="truncate">{item.label}</span>
                          {item.badge && (
                            <span className="ml-auto h-4 min-w-4 px-1 flex items-center justify-center text-[9px] font-bold rounded-full bg-destructive/90 text-white">
                              •
                            </span>
                          )}
                        </>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Favorites */}
      {!navCollapsed && favorites.length > 0 && (
        <div className="px-2 py-2 border-t">
          <h2 className="px-2 mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1">
            <Star className="h-2.5 w-2.5" /> Pinned
          </h2>
          <ul className="space-y-px">
            {favorites.slice(0, 5).map((fav) => (
              <li key={fav.id}>
                <Link href={fav.href} className="flex items-center gap-2 px-2 py-1 text-[12px] rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground truncate">
                  <Star className="h-3 w-3 text-yellow-500 shrink-0" />
                  <span className="truncate">{fav.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent */}
      {!navCollapsed && recentItems.length > 0 && (
        <div className="px-2 py-2 border-t">
          <h2 className="px-2 mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" /> Recent
          </h2>
          <ul className="space-y-px">
            {recentItems.slice(0, 5).map((item) => (
              <li key={item.id}>
                <Link href={item.href} className="flex items-center gap-2 px-2 py-1 text-[12px] rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground truncate">
                  <span className="truncate">{item.title}</span>
                  <span className="text-[9px] text-muted-foreground/50 ml-auto shrink-0">{item.type}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer */}
      <div className={cn('p-3 border-t space-y-2 shrink-0', navCollapsed && 'px-1')}>
        {!navCollapsed && (
          <>
            <StaffPresence />
            <div className="flex items-center gap-2 px-1">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary shrink-0">
                FO
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium truncate">Founder</p>
                <p className="text-[9px] text-muted-foreground truncate">Full Access</p>
              </div>
            </div>
          </>
        )}

        {navCollapsed && (
          <div className="flex justify-center">
            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary" title="Founder — Full Access">
              FO
            </div>
          </div>
        )}

        {/* Collapse/Expand Toggle */}
        <button
          onClick={toggleNav}
          className={cn(
            'flex items-center justify-center w-full py-1.5 rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors duration-100',
            navCollapsed && 'px-0'
          )}
          aria-label={navCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          title={navCollapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {navCollapsed ? (
            <ChevronsRight className="h-4 w-4" />
          ) : (
            <ChevronsLeft className="h-4 w-4" />
          )}
        </button>
      </div>
    </aside>
  );
}
