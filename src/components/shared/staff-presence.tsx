'use client';

import { useCallback, useState } from 'react';
import { Users } from 'lucide-react';
import { readApiJson } from '@/lib/api/fetch';
import { fetchForPolling, useAdaptivePolling } from '@/hooks/use-adaptive-polling';

interface OnlineStaff {
  id: string;
  name: string;
  role: string;
  currentModule: string;
  lastActive: string;
}

const PRESENCE_CACHE_MS = 15000;
let cachedPresence: { data: OnlineStaff[]; expiresAt: number } | null = null;
let presenceRequest: Promise<OnlineStaff[]> | null = null;

function isOnlineStaff(value: unknown): value is OnlineStaff {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const staff = value as Record<string, unknown>;
  return (
    typeof staff.id === 'string' &&
    typeof staff.name === 'string' &&
    typeof staff.role === 'string' &&
    typeof staff.currentModule === 'string' &&
    typeof staff.lastActive === 'string'
  );
}

/**
 * Staff presence widget — fetches real active sessions from backend.
 */
export function StaffPresence() {
  const [onlineStaff, setOnlineStaff] = useState<OnlineStaff[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchPresence = useCallback(async () => {
    setLoading(true);
    try {
      setOnlineStaff(await loadPresence());
      setError('');
    } catch (presenceError) {
      setError(presenceError instanceof Error ? presenceError.message : 'Failed to load staff presence');
      throw presenceError;
    } finally {
      setLoading(false);
    }
  }, []);
  useAdaptivePolling(fetchPresence, 60000);

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
        <span className="text-muted-foreground">
          {loading ? 'Updating…' : error ? 'Presence unavailable' : `${onlineStaff.length} online`}
        </span>
      </button>

      {expanded && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setExpanded(false)} />
          <div className="absolute bottom-full left-0 mb-2 z-50 w-64 rounded-lg border bg-background p-2 shadow-xl">
            <div className="flex items-center gap-2 px-2 py-1 border-b mb-1">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Staff Online ({onlineStaff.length})</span>
            </div>
            {error ? (
              <div className="px-2 py-2" role="alert">
                <p className="text-xs text-destructive">{error}</p>
                <button
                  type="button"
                  onClick={() => void fetchPresence().catch(() => undefined)}
                  disabled={loading}
                  className="mt-2 text-xs font-medium text-primary disabled:opacity-50"
                >
                  Try again
                </button>
              </div>
            ) : onlineStaff.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-2">
                {loading ? 'Loading staff presence…' : 'No staff currently online'}
              </p>
            ) : onlineStaff.map((staff) => (
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

async function loadPresence(): Promise<OnlineStaff[]> {
  if (cachedPresence && cachedPresence.expiresAt > Date.now()) {
    return cachedPresence.data;
  }
  if (presenceRequest) return presenceRequest;

  const request = (async () => {
    const response = await fetchForPolling('/api/staff/presence');
    let payload: Record<string, unknown>;
    try {
      payload = await readApiJson(response);
    } catch (parseError) {
      throw new Error(`Presence response could not be parsed: ${
        parseError instanceof Error ? parseError.message : 'invalid response'
      }`);
    }
    if (!Array.isArray(payload.data) || !payload.data.every(isOnlineStaff)) {
      throw new Error('The staff presence service returned an invalid response');
    }
    cachedPresence = { data: payload.data, expiresAt: Date.now() + PRESENCE_CACHE_MS };
    return payload.data;
  })();

  presenceRequest = request;
  try {
    return await request;
  } finally {
    if (presenceRequest === request) presenceRequest = null;
  }
}
