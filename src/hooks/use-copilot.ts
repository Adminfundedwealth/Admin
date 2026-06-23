'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  structuredData?: CopilotStructuredResponse;
  entityRefs?: EntityReference[];
  timestamp: string;
}

export interface CopilotStructuredResponse {
  type: 'metric' | 'table' | 'list' | 'summary' | 'navigation';
  data: Record<string, unknown>;
}

export interface EntityReference {
  id: string;
  type: string;
  label: string;
  href: string;
}

export interface PinnedResponse {
  id: string;
  content: CopilotStructuredResponse;
  pinnedAt: string;
}

interface CopilotState {
  open: boolean;
  messages: CopilotMessage[];
  isProcessing: boolean;
  suggestedChips: string[];
  pinnedResponses: PinnedResponse[];
}

// ---------------------------------------------------------------------------
// Default suggestions by role
// ---------------------------------------------------------------------------

const defaultSuggestions: Record<string, string[]> = {
  founder: ['Revenue today', 'Pending payouts', 'Risk exposure', 'KYC queue', 'Staff online', 'Daily summary'],
  finance: ['Pending payouts', 'Payout liability', 'Revenue MTD', 'Today\'s approvals'],
  risk: ['High-risk accounts', 'Active breaches', 'Risk exposure', 'Capital at risk'],
  support: ['Open tickets', 'SLA breaches', 'Unassigned tickets', 'Support summary'],
  operations: ['Pending KYC', 'Challenge passes today', 'New registrations', 'Queue health'],
  default: ['Show pending payouts', 'Show KYC queue', 'Revenue today', 'Risk alerts'],
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCopilot(userRole: string = 'default') {
  const [state, setState] = useState<CopilotState>({
    open: false,
    messages: [],
    isProcessing: false,
    suggestedChips: defaultSuggestions[userRole] ?? defaultSuggestions.default,
    pinnedResponses: [],
  });

  const maxMessages = 20; // 10 exchanges = 20 messages
  const abortRef = useRef<AbortController | null>(null);

  // --- Keyboard shortcut: Ctrl+J / Cmd+J ---
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'j') {
        e.preventDefault();
        setState((prev) => ({ ...prev, open: !prev.open }));
      }
    }
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, []);

  // --- Listen for toggle-copilot custom event (from header button) ---
  useEffect(() => {
    function handleToggle() {
      setState((prev) => ({ ...prev, open: !prev.open }));
    }
    document.addEventListener('toggle-copilot', handleToggle);
    return () => document.removeEventListener('toggle-copilot', handleToggle);
  }, []);

  // --- Submit query ---
  const submitQuery = useCallback(async (query: string) => {
    if (!query.trim()) return;

    const userMsg: CopilotMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: query.trim(),
      timestamp: new Date().toISOString(),
    };

    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, userMsg].slice(-maxMessages),
      isProcessing: true,
    }));

    // Abort previous request if any
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/copilot/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          context: { previousMessages: state.messages.slice(-10) },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error ?? 'Request failed');
      }

      const data = await res.json();

      const assistantMsg: CopilotMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.content ?? '',
        structuredData: data.structuredData,
        entityRefs: data.entityRefs,
        timestamp: new Date().toISOString(),
      };

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, assistantMsg].slice(-maxMessages),
        isProcessing: false,
      }));

      // If navigation command, trigger navigation
      if (data.type === 'navigation' && data.navigation) {
        window.location.href = data.navigation;
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;

      const errorMsg: CopilotMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: err instanceof Error ? err.message : 'Something went wrong. Try again.',
        timestamp: new Date().toISOString(),
      };

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, errorMsg].slice(-maxMessages),
        isProcessing: false,
      }));
    }
  }, [state.messages]);

  // --- Toggle panel ---
  const toggle = useCallback(() => {
    setState((prev) => ({ ...prev, open: !prev.open }));
  }, []);

  const close = useCallback(() => {
    setState((prev) => ({ ...prev, open: false }));
    abortRef.current?.abort();
  }, []);

  // --- Clear conversation ---
  const clear = useCallback(() => {
    setState((prev) => ({ ...prev, messages: [] }));
  }, []);

  // --- Pin/unpin response ---
  const pinResponse = useCallback((msg: CopilotMessage) => {
    if (!msg.structuredData) return;
    setState((prev) => {
      if (prev.pinnedResponses.length >= 3) return prev;
      const pinned: PinnedResponse = {
        id: msg.id,
        content: msg.structuredData!,
        pinnedAt: new Date().toISOString(),
      };
      return { ...prev, pinnedResponses: [...prev.pinnedResponses, pinned] };
    });
  }, []);

  const unpinResponse = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      pinnedResponses: prev.pinnedResponses.filter((p) => p.id !== id),
    }));
  }, []);

  return {
    ...state,
    toggle,
    close,
    clear,
    submitQuery,
    pinResponse,
    unpinResponse,
  };
}
