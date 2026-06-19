'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface FilterOption {
  label: string;
  value: string;
}

interface SelectFilterProps {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SelectFilter({ label, value, options, onChange, placeholder = 'All' }: SelectFilterProps) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface TextFilterProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function TextFilter({ label, value, onChange, placeholder }: TextFilterProps) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9"
      />
    </div>
  );
}

interface DateRangeFilterProps {
  label: string;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}

export function DateRangeFilter({ label, from, to, onFromChange, onToChange }: DateRangeFilterProps) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex gap-2">
        <Input type="date" value={from} onChange={(e) => onFromChange(e.target.value)} className="h-9" />
        <Input type="date" value={to} onChange={(e) => onToChange(e.target.value)} className="h-9" />
      </div>
    </div>
  );
}

interface NumberRangeFilterProps {
  label: string;
  min: string;
  max: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
  placeholderMin?: string;
  placeholderMax?: string;
}

export function NumberRangeFilter({ label, min, max, onMinChange, onMaxChange, placeholderMin = 'Min', placeholderMax = 'Max' }: NumberRangeFilterProps) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex gap-2">
        <Input type="number" value={min} onChange={(e) => onMinChange(e.target.value)} placeholder={placeholderMin} className="h-9" />
        <Input type="number" value={max} onChange={(e) => onMaxChange(e.target.value)} placeholder={placeholderMax} className="h-9" />
      </div>
    </div>
  );
}

interface FilterBarProps {
  children: React.ReactNode;
  onClear?: () => void;
  hasActiveFilters?: boolean;
}

export function FilterBar({ children, onClear, hasActiveFilters }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-end gap-3 p-4 rounded-lg border bg-muted/30">
      {children}
      {hasActiveFilters && onClear && (
        <Button variant="ghost" size="sm" onClick={onClear} className="gap-1 h-9 mt-auto">
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
}
