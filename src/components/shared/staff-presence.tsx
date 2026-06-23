'use client';

import { useState, useEffect } from 'react';
import { Users } from 'lucide-react';

interface OnlineStaff {
  id: string;
  name: string;
  role: string;
  currentModule: string;
  lastActive: string;
}

/**
 * Staff presence widget — fetches real active sessions from backend.
 */
export function StaffPresence() {
  const [onlineStaff, setOnlineStaff] = useState<OnlineStaff[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchPresence();
    const interval = setInterval(fetchPresence, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  async function fetchPresence() {
    try {
      const res = await fetch('/api/staff/presence');
      if (res.ok) {
        const json = await res.json();
        setOnlineStaff(json.data || []);
      }
    } catch {
      // Keep existing data on failure
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-accent transition-colors text-xs w-full"
      >
        <div className="flex -space-x-1.5">
          {onlineStaff.slice(0, 3).map((s) => (
            <div key={s.id} className="h-5 w-5 rounded-full bg-green-100 border-2 border-background flex items-center justify-center">
              <span className="text-[8px] font-bold text-green-700">{s.name[0]}</span>
            </div>
          ))}
          {onlineStaff.length === 0 && <div className="h-5 w-5 rounded-full bg-muted border-2 border-background" />}
        </div>
        <span className="text-muted-foreground">{onlineStaff.length} online</span>
      </button>

      {expanded && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setExpanded(false)} />
          <div className="absolute bottom-full left-0 mb-2 z-50 w-64 rounded-lg border bg-background p-2 shadow-xl">
            <div className="flex items-center gap-2 px-2 py-1 border-b mb-1">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Staff Online ({onlineStaff.length})</span>
            </div>
            {onlineStaff.length === 0 && <p className="text-xs text-muted-foreground px-2 py-2">No staff currently online</p>}
            {onlineStaff.map((staff) => (
              <div key={staff.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/50">
                <div className="relative">
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary">
                    {staff.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-500 border border-background" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium truncate">{staff.name}</p>
                  <p className="text-[9px] text-muted-foreground">{staff.role} • {staff.currentModule}</p>
                </div>
                <span className="text-[9px] text-muted-foreground">{staff.lastActive}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
