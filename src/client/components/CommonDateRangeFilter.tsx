import React from 'react';
import { Calendar, CalendarRange, RotateCcw } from 'lucide-react';
import { formatDateSL, type DateRangePreset, getDateRangeForPreset } from '../../shared/decimal';

interface CommonDateRangeFilterProps {
  startDate: string;
  endDate: string;
  preset: DateRangePreset;
  onDateRangeChange: (startDate: string, endDate: string, preset: DateRangePreset) => void;
  className?: string;
}

export const CommonDateRangeFilter: React.FC<CommonDateRangeFilterProps> = ({
  startDate,
  endDate,
  preset,
  onDateRangeChange,
  className = '',
}) => {
  const PRESET_OPTIONS: Array<{ id: DateRangePreset; label: string }> = [
    { id: 'CURRENT_MONTH', label: 'Current Month' },
    { id: 'PREV_MONTH', label: 'Previous Month' },
    { id: 'LAST_30_DAYS', label: 'Last 30 Days' },
    { id: 'LAST_3M', label: 'Last 3 Months' },
    { id: 'LAST_6M', label: 'Last 6 Months' },
    { id: 'CURRENT_YEAR', label: 'This Year' },
    { id: 'CUSTOM', label: 'Custom Range' },
  ];

  const handlePresetSelect = (newPreset: DateRangePreset) => {
    if (newPreset === 'CUSTOM') {
      onDateRangeChange(startDate, endDate, 'CUSTOM');
    } else {
      const range = getDateRangeForPreset(newPreset);
      onDateRangeChange(range.startDate, range.endDate, newPreset);
    }
  };

  const handleStartChange = (val: string) => {
    onDateRangeChange(val, endDate, 'CUSTOM');
  };

  const handleEndChange = (val: string) => {
    onDateRangeChange(startDate, val, 'CUSTOM');
  };

  const handleResetToCurrentMonth = () => {
    const range = getDateRangeForPreset('CURRENT_MONTH');
    onDateRangeChange(range.startDate, range.endDate, 'CURRENT_MONTH');
  };

  return (
    <div
      className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-4 shadow-sm transition ${className}`}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Left: Preset Buttons / Select */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 mr-1 shrink-0">
            <CalendarRange className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="hidden sm:inline">Period:</span>
          </div>

          {/* Desktop & Tablet preset buttons */}
          <div className="hidden sm:flex flex-wrap items-center gap-1">
            {PRESET_OPTIONS.map((opt) => {
              const active = preset === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => handlePresetSelect(opt.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                    active
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Mobile Select dropdown for compact display */}
          <div className="sm:hidden flex-1 min-w-[140px]">
            <select
              value={preset}
              onChange={(e) => handlePresetSelect(e.target.value as DateRangePreset)}
              aria-label="Filter period preset"
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200"
            >
              {PRESET_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right: Date range inputs and active range indicator */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <input
              type="date"
              value={startDate}
              onChange={(e) => handleStartChange(e.target.value)}
              aria-label="Start date"
              className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-xs text-slate-800 dark:text-slate-200"
            />
            <span className="text-slate-400 font-medium">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => handleEndChange(e.target.value)}
              aria-label="End date"
              className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-xs text-slate-800 dark:text-slate-200"
            />
          </div>

          {/* Active Period Label badge */}
          <div className="hidden lg:flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-medium text-[11px] border border-blue-200 dark:border-blue-900">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span>
              {formatDateSL(startDate)} – {formatDateSL(endDate)}
            </span>
          </div>

          {preset !== 'CURRENT_MONTH' && (
            <button
              onClick={handleResetToCurrentMonth}
              title="Reset to Current Month"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

