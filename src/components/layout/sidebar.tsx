'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { sidebarNavigation } from '@/config/navigation';
import {
  LayoutDashboard, Users, Trophy, TrendingUp, Wallet, BarChart3,
  ShieldCheck, AlertTriangle, FileText, Activity, ListOrdered,
  Link as LinkIcon, Megaphone, Headphones, Award, Monitor, UserCog, Settings,
} from 'lucide-react';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Users, Trophy, TrendingUp, Wallet, BarChart3,
  ShieldCheck, AlertTriangle, FileText, Activity, ListOrdered,
  Link: LinkIcon, Megaphone, Headphones, Award, Monitor, UserCog, Settings,
};

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'w-64 border-r bg-sidebar flex flex-col h-screen sticky top-0 overflow-y-auto',
        className
      )}
    >
      {/* Logo / Brand */}
      <div className="p-4 border-b">
        <h1 className="text-lg font-bold text-sidebar-foreground">FundedWealth</h1>
        <p className="text-xs text-muted-foreground">Admin Operating System</p>
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 p-3 space-y-6" aria-label="Main navigation">
        {sidebarNavigation.map((section) => (
          <div key={section.label}>
            <h2 className="px-3 mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {section.label}
            </h2>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = iconMap[item.icon];
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors',
                        isActive
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                      )}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      {Icon && <Icon className="h-4 w-4 shrink-0" />}
                      <span className="truncate">{item.label}</span>
                      {item.badge && (
                        <span className="ml-auto inline-flex items-center justify-center h-5 min-w-5 px-1 text-xs font-medium rounded-full bg-destructive text-destructive-foreground">
                          {/* Badge count loaded via hook */}
                          •
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t text-xs text-muted-foreground">
        <p>v0.1.0 • admin.fundedwealth.com</p>
      </div>
    </aside>
  );
}
