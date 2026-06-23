'use client';

import { useRef, useState, useEffect, type FormEvent } from 'react';
import { useCopilot, type CopilotMessage, type CopilotStructuredResponse, type EntityReference } from '@/hooks/use-copilot';
import { cn } from '@/lib/utils';
import { X, Send, Pin, Trash2, ExternalLink } from 'lucide-react';
import Link from 'next/link';

/**
 * AI Operations Copilot — slide-over panel.
 * Native to the Admin OS design system. Not a chatbot — an operations copilot.
 * No chat bubbles, no avatars, no typing dots.
 */
export function OperationsCopilot() {
  const {
    open,
    messages,
    isProcessing,
    suggestedChips,
    close,
    clear,
    submitQuery,
    pinResponse,
  } = useCopilot('founder');

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;
    submitQuery(input);
    setInput('');
  }

  function handleChipClick(chip: string) {
    submitQuery(chip);
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop (subtle) */}
      <div
        className="fixed inset-0 z-50 bg-black/20"
        onClick={close}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        className="fixed top-0 right-0 z-50 h-full w-[440px] max-w-[90vw] border-l bg-background shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
        role="dialog"
        aria-label="Operations Copilot"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-12 border-b shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Operations Copilot</h2>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title="Connected" />
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={clear}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear conversation"
                title="Clear conversation"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={close}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close copilot"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {isProcessing && (
          <div className="h-0.5 w-full bg-muted overflow-hidden shrink-0">
            <div className="h-full w-1/3 bg-accent animate-pulse rounded-full" />
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {messages.length === 0 ? (
            <EmptyState chips={suggestedChips} onChipClick={handleChipClick} />
          ) : (
            messages.map((msg) => (
              <MessageRow key={msg.id} message={msg} onPin={pinResponse} />
            ))
          )}
        </div>

        {/* Suggested chips (shown when idle) */}
        {messages.length > 0 && !isProcessing && (
          <div className="flex flex-wrap gap-1.5 px-4 py-2 border-t shrink-0">
            {suggestedChips.slice(0, 4).map((chip) => (
              <button
                key={chip}
                onClick={() => handleChipClick(chip)}
                className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <form onSubmit={handleSubmit} className="px-4 py-3 border-t shrink-0">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about operations..."
              className="flex-1 h-9 px-3 rounded-md border bg-muted/40 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              disabled={isProcessing}
              aria-label="Copilot query input"
            />
            <button
              type="submit"
              disabled={!input.trim() || isProcessing}
              className="h-9 w-9 inline-flex items-center justify-center rounded-md bg-accent text-white disabled:opacity-40 hover:bg-accent/90 transition-colors"
              aria-label="Submit query"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Try: &quot;How many pending payouts?&quot; or &quot;Go to KYC&quot;
          </p>
        </form>
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmptyState({ chips, onChipClick }: { chips: string[]; onChipClick: (c: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-12">
      <p className="text-sm font-medium text-foreground mb-1">Operations Copilot</p>
      <p className="text-[12px] text-muted-foreground mb-6 max-w-[280px]">
        Ask about revenue, payouts, risk, KYC, traders, or navigate anywhere in the system.
      </p>
      <div className="flex flex-wrap gap-2 justify-center">
        {chips.map((chip) => (
          <button
            key={chip}
            onClick={() => onChipClick(chip)}
            className="px-3 py-1.5 rounded-md text-[12px] font-medium border bg-muted/40 text-muted-foreground hover:text-foreground hover:border-accent/40 transition-colors"
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageRow({ message, onPin }: { message: CopilotMessage; onPin: (m: CopilotMessage) => void }) {
  if (message.role === 'user') {
    return (
      <div className="text-right">
        <span className="inline-block text-[13px] text-foreground font-medium px-3 py-1.5 rounded-md bg-accent/10 max-w-[90%] text-left">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Text content */}
      {message.content && (
        <p className="text-[13px] text-foreground/90 leading-relaxed">{message.content}</p>
      )}

      {/* Structured data */}
      {message.structuredData && (
        <StructuredDataDisplay data={message.structuredData} />
      )}

      {/* Entity references */}
      {message.entityRefs && message.entityRefs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {message.entityRefs.map((ref) => (
            <EntityLink key={ref.id} entity={ref} />
          ))}
        </div>
      )}

      {/* Pin action */}
      {message.structuredData && (
        <button
          onClick={() => onPin(message)}
          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          title="Pin to dashboard"
        >
          <Pin className="h-2.5 w-2.5" />
          Pin
        </button>
      )}
    </div>
  );
}

function StructuredDataDisplay({ data }: { data: CopilotStructuredResponse }) {
  if (data.type === 'metric') {
    const d = data.data as { label?: string; value?: string | number; delta?: number };
    return (
      <div className="rounded-md border p-3 bg-muted/20">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{d.label}</span>
        <p className="text-lg font-semibold tabular-nums mt-0.5">{d.value}</p>
        {d.delta !== undefined && (
          <span className={cn('text-[11px] font-medium', d.delta > 0 ? 'text-emerald-500' : d.delta < 0 ? 'text-red-500' : 'text-muted-foreground')}>
            {d.delta > 0 ? '+' : ''}{d.delta}%
          </span>
        )}
      </div>
    );
  }

  if (data.type === 'table') {
    const d = data.data as { headers?: string[]; rows?: string[][] };
    if (!d.headers || !d.rows) return null;
    return (
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-[12px]">
          <thead className="bg-muted/40">
            <tr>
              {d.headers.map((h, i) => (
                <th key={i} className="px-2 py-1.5 text-left font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.rows.slice(0, 10).map((row, i) => (
              <tr key={i} className="border-t">
                {row.map((cell, j) => (
                  <td key={j} className="px-2 py-1.5 text-foreground/80">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {d.rows.length > 10 && (
          <p className="text-[10px] text-muted-foreground text-center py-1.5 border-t">
            Showing 10 of {d.rows.length} results
          </p>
        )}
      </div>
    );
  }

  if (data.type === 'list') {
    const d = data.data as { items?: string[] };
    if (!d.items) return null;
    return (
      <ul className="space-y-1 text-[12px] text-foreground/80">
        {d.items.map((item, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span className="h-1 w-1 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
            {item}
          </li>
        ))}
      </ul>
    );
  }

  if (data.type === 'summary') {
    const d = data.data as { title?: string; content?: string };
    return (
      <div className="rounded-md border p-3 bg-muted/20 space-y-1">
        {d.title && <p className="text-[12px] font-semibold">{d.title}</p>}
        {d.content && <p className="text-[12px] text-foreground/80 leading-relaxed whitespace-pre-wrap">{d.content}</p>}
      </div>
    );
  }

  return null;
}

function EntityLink({ entity }: { entity: EntityReference }) {
  return (
    <Link
      href={entity.href}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border bg-muted/30 text-accent hover:bg-accent/10 transition-colors"
    >
      {entity.label}
      <ExternalLink className="h-2.5 w-2.5" />
    </Link>
  );
}
