'use client';

import { useState, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type RowSelectionState,
  type VisibilityState,
} from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { DensityControl, useDensity } from './density-control';
import { cn } from '@/lib/utils';
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ArrowUpDown, ArrowUp, ArrowDown, Columns, X,
} from 'lucide-react';
import type { Density } from '@/config/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActionItem {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  action: () => void;
  variant?: 'default' | 'destructive';
  permission?: string;
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  tableId?: string;
  pageSize?: number;
  pageSizeOptions?: number[];
  enableRowSelection?: boolean;
  onRowSelectionChange?: (selection: RowSelectionState) => void;
  onRowClick?: (row: TData) => void;
  totalCount?: number;
  isLoading?: boolean;
  // Enhanced features
  enableStickyHeader?: boolean;
  enableHoverActions?: boolean;
  hoverActions?: (row: TData) => ActionItem[];
  enableDensityControl?: boolean;
  enableColumnVisibility?: boolean;
  // Active filters display
  activeFilters?: { key: string; label: string; value: string }[];
  onRemoveFilter?: (key: string) => void;
  onClearFilters?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DataTable<TData, TValue>({
  columns,
  data,
  tableId = 'default',
  pageSize = 20,
  pageSizeOptions = [10, 20, 50, 100],
  enableRowSelection = false,
  onRowSelectionChange,
  onRowClick,
  totalCount,
  isLoading = false,
  enableStickyHeader = true,
  enableHoverActions = true,
  hoverActions,
  enableDensityControl = true,
  enableColumnVisibility = true,
  activeFilters,
  onRemoveFilter,
  onClearFilters,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [density, setDensity] = useState<Density>('default');

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, rowSelection, columnVisibility },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: (updater) => {
      const newSelection = typeof updater === 'function' ? updater(rowSelection) : updater;
      setRowSelection(newSelection);
      onRowSelectionChange?.(newSelection);
    },
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableRowSelection,
    initialState: { pagination: { pageSize } },
  });

  const rowHeightClass = {
    compact: 'h-9',
    default: 'h-11',
    comfortable: 'h-13',
  }[density];

  const filteredCount = table.getFilteredRowModel().rows.length;
  const displayTotal = totalCount ?? filteredCount;

  return (
    <div className="space-y-3">
      {/* Toolbar: Density + Column Visibility + Record Count */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* Record count */}
          <span className="text-[11px] text-muted-foreground tabular-nums">
            Showing {table.getRowModel().rows.length} of {displayTotal} records
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Column visibility toggle */}
          {enableColumnVisibility && (
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                onClick={() => setShowColumnPicker(!showColumnPicker)}
              >
                <Columns className="h-3 w-3" />
                Columns
              </Button>
              {showColumnPicker && (
                <ColumnPicker
                  table={table}
                  onClose={() => setShowColumnPicker(false)}
                />
              )}
            </div>
          )}

          {/* Density control */}
          {enableDensityControl && (
            <DensityControl
              tableId={tableId}
              value={density}
              onChange={setDensity}
            />
          )}
        </div>
      </div>

      {/* Active filter tags */}
      {activeFilters && activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeFilters.map((filter) => (
            <span
              key={filter.key}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border bg-muted/40"
            >
              <span className="text-muted-foreground">{filter.label}:</span>
              <span>{filter.value}</span>
              {onRemoveFilter && (
                <button
                  onClick={() => onRemoveFilter(filter.key)}
                  className="ml-0.5 hover:text-destructive"
                  aria-label={`Remove ${filter.label} filter`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </span>
          ))}
          {onClearFilters && (
            <button
              onClick={onClearFilters}
              className="text-[11px] text-muted-foreground hover:text-foreground underline"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        <div className="overflow-x-auto max-h-[calc(100vh-280px)] overflow-y-auto">
          <table className="w-full text-[13px]">
            <thead className={cn(
              'bg-muted/50',
              enableStickyHeader && 'sticky top-0 z-10'
            )}>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="h-9 px-3 text-left align-middle font-medium text-muted-foreground whitespace-nowrap border-b"
                    >
                      {header.isPlaceholder ? null : (
                        <div
                          className={
                            header.column.getCanSort()
                              ? 'flex items-center gap-1 cursor-pointer select-none hover:text-foreground transition-colors'
                              : ''
                          }
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && (
                            header.column.getIsSorted() === 'asc' ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : header.column.getIsSorted() === 'desc' ? (
                              <ArrowDown className="h-3 w-3" />
                            ) : (
                              <ArrowUpDown className="h-3 w-3 opacity-40" />
                            )
                          )}
                        </div>
                      )}
                    </th>
                  ))}
                  {/* Hover actions column header */}
                  {enableHoverActions && hoverActions && (
                    <th className="h-9 w-24 px-3 border-b" />
                  )}
                </tr>
              ))}
            </thead>
            <tbody>
              {isLoading ? (
                // Skeleton rows
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skeleton-${i}`} className="border-t">
                    {columns.map((_, j) => (
                      <td key={j} className={cn('px-3', rowHeightClass)}>
                        <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + (enableHoverActions && hoverActions ? 1 : 0)}
                    className="h-24 text-center text-muted-foreground text-sm"
                  >
                    No results found.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      'border-t group transition-colors',
                      onRowClick && 'cursor-pointer',
                      row.getIsSelected() ? 'bg-accent/10' : 'hover:bg-muted/50'
                    )}
                    data-state={row.getIsSelected() && 'selected'}
                    onClick={() => onRowClick?.(row.original)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className={cn('px-3 align-middle whitespace-nowrap', rowHeightClass)}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                    {/* Hover actions */}
                    {enableHoverActions && hoverActions && (
                      <td className={cn('px-2 align-middle', rowHeightClass)}>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 justify-end">
                          {hoverActions(row.original).slice(0, 3).map((action, idx) => {
                            const Icon = action.icon;
                            return (
                              <button
                                key={idx}
                                onClick={(e) => { e.stopPropagation(); action.action(); }}
                                className={cn(
                                  'h-6 px-2 rounded text-[11px] font-medium flex items-center gap-1 transition-colors',
                                  action.variant === 'destructive'
                                    ? 'hover:bg-destructive/10 hover:text-destructive text-muted-foreground'
                                    : 'hover:bg-accent/20 text-muted-foreground hover:text-foreground'
                                )}
                                title={action.label}
                              >
                                {Icon && <Icon className="h-3 w-3" />}
                                <span>{action.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-muted-foreground tabular-nums">
          {enableRowSelection && Object.keys(rowSelection).length > 0 && (
            <span className="font-medium">{Object.keys(rowSelection).length} selected · </span>
          )}
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() ?? 1}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={table.getState().pagination.pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
            className="h-7 rounded-md border bg-background px-2 text-[11px]"
            aria-label="Rows per page"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>
          <div className="flex items-center gap-0.5">
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
              <ChevronsLeft className="h-3 w-3" />
            </Button>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              <ChevronRight className="h-3 w-3" />
            </Button>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}>
              <ChevronsRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column Picker Dropdown
// ---------------------------------------------------------------------------

function ColumnPicker({ table, onClose }: { table: any; onClose: () => void }) {
  const allColumns = table.getAllColumns().filter((col: any) => col.getCanHide());
  const visibleCount = allColumns.filter((col: any) => col.getIsVisible()).length;

  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div className="absolute right-0 top-8 z-30 w-48 rounded-md border bg-popover p-2 shadow-lg">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">
          Toggle columns
        </p>
        {allColumns.map((column: any) => {
          const isVisible = column.getIsVisible();
          const canHide = visibleCount > 3 || !isVisible;
          return (
            <label
              key={column.id}
              className={cn(
                'flex items-center gap-2 px-1 py-1 rounded text-[12px] cursor-pointer hover:bg-muted/50',
                !canHide && isVisible && 'opacity-50 cursor-not-allowed'
              )}
            >
              <input
                type="checkbox"
                checked={isVisible}
                onChange={() => {
                  if (canHide || !isVisible) {
                    column.toggleVisibility(!isVisible);
                  }
                }}
                disabled={!canHide && isVisible}
                className="h-3 w-3 rounded"
              />
              <span className="truncate capitalize">{column.id.replace(/_/g, ' ')}</span>
            </label>
          );
        })}
      </div>
    </>
  );
}
