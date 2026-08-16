/**
 * Risk Rules validation — runs in Admin OS before forwarding to Terminal.
 * Rejects impossible/unsafe values before they reach the Risk Engine.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Validate a percentage is 0-100 */
function pct(val: unknown, name: string, min = 0, max = 100): string | null {
  if (val === undefined || val === null) return null;
  const n = Number(val);
  if (isNaN(n)) return `${name} must be a number`;
  if (n < min || n > max) return `${name} must be between ${min} and ${max}`;
  return null;
}

/** Validate a positive integer */
function posInt(val: unknown, name: string, min = 1, max = 10000): string | null {
  if (val === undefined || val === null) return null;
  const n = Number(val);
  if (!Number.isInteger(n)) return `${name} must be an integer`;
  if (n < min) return `${name} must be at least ${min}`;
  if (n > max) return `${name} must be at most ${max}`;
  return null;
}

/** Validate HH:MM time string */
function time(val: unknown, name: string): string | null {
  if (val === undefined || val === null) return null;
  if (typeof val !== 'string' || !/^\d{2}:\d{2}$/.test(val)) return `${name} must be HH:MM format`;
  const [h, m] = val.split(':').map(Number);
  if (h < 0 || h > 23) return `${name} hours must be 0-23`;
  if (m < 0 || m > 59) return `${name} minutes must be 0-59`;
  return null;
}

/** Validate boolean */
function bool(val: unknown, name: string): string | null {
  if (val === undefined || val === null) return null;
  if (typeof val !== 'boolean') return `${name} must be true or false`;
  return null;
}

/** Validate allowed_segments array */
function segments(val: unknown, name: string): string | null {
  if (val === undefined || val === null) return null;
  if (!Array.isArray(val)) return `${name} must be an array`;
  const VALID = ['NSE', 'NFO', 'BFO', 'MCX', 'CDS', 'BSE'];
  const invalid = (val as string[]).filter(s => !VALID.includes(s));
  if (invalid.length > 0) return `${name} contains invalid segments: ${invalid.join(', ')}`;
  if (val.length === 0) return `${name} must contain at least one segment`;
  return null;
}

function collect(...errs: (string | null)[]): string[] {
  return errs.filter((e): e is string => e !== null);
}

// ─── Per-plan validators ──────────────────────────────────────────────────────

export function validateFlashUpdates(updates: Record<string, unknown>): ValidationResult {
  const errors = collect(
    pct(updates.per_position_loss_pct, 'per_position_loss_pct', 0.1, 20),
    pct(updates.max_drawdown_pct,      'max_drawdown_pct',      0.1, 30),
    pct(updates.profit_target_pct,     'profit_target_pct',     0, 50),
    pct(updates.profit_split_pct,      'profit_split_pct',      1, 100),
    pct(updates.consistency_rule_pct,  'consistency_rule_pct',  1, 100),
    pct(updates.payout_threshold_pct,  'payout_threshold_pct',  0.1, 50),
    posInt(updates.max_open_positions, 'max_open_positions',    1, 500),
    posInt(updates.leverage_max,       'leverage_max',          1, 200),
    posInt(updates.duration_hours,     'duration_hours',        1, 720),
    time(updates.trading_hours_start, 'trading_hours_start'),
    time(updates.trading_hours_end,   'trading_hours_end'),
    bool(updates.overnight_allowed,   'overnight_allowed'),
    bool(updates.weekend_allowed,     'weekend_allowed'),
    bool(updates.holiday_restriction, 'holiday_restriction'),
    segments(updates.allowed_segments, 'allowed_segments'),
  );
  return { valid: errors.length === 0, errors };
}

export function validateInstantUpdates(updates: Record<string, unknown>): ValidationResult {
  const errors = collect(
    pct(updates.daily_loss_pct,               'daily_loss_pct',               0.1, 20),
    pct(updates.max_drawdown_pct,             'max_drawdown_pct',             0.1, 30),
    pct(updates.profit_target_pct,            'profit_target_pct',            0, 50),
    pct(updates.profit_split_pct,             'profit_split_pct',             1, 100),
    pct(updates.payout_threshold_pct,         'payout_threshold_pct',         0.1, 50),
    pct(updates.consistency_rule_pct,         'consistency_rule_pct',         1, 100),
    pct(updates.daily_profit_cap_pct,         'daily_profit_cap_pct',         0.1, 50),
    pct(updates.max_position_size_pct,        'max_position_size_pct',        1, 100),
    pct(updates.risk_per_idea_pct,            'risk_per_idea_pct',            0.1, 20),
    posInt(updates.max_open_positions,        'max_open_positions',           1, 500),
    posInt(updates.leverage_max,              'leverage_max',                 1, 200),
    posInt(updates.min_trading_days,          'min_trading_days',             1, 365),
    posInt(updates.risk_per_idea_window_min,  'risk_per_idea_window_min',     1, 1440),
    posInt(updates.inactivity_close_days,     'inactivity_close_days',        1, 365),
    time(updates.trading_hours_start, 'trading_hours_start'),
    time(updates.trading_hours_end,   'trading_hours_end'),
    bool(updates.overnight_allowed,   'overnight_allowed'),
    bool(updates.weekend_allowed,     'weekend_allowed'),
    bool(updates.holiday_restriction, 'holiday_restriction'),
    segments(updates.allowed_segments, 'allowed_segments'),
  );
  return { valid: errors.length === 0, errors };
}

function validatePhaseFields(updates: Record<string, unknown>, prefix: string): string[] {
  return collect(
    pct(updates[`${prefix}daily_loss_pct`],          `${prefix}daily_loss_pct`,          0.1, 20),
    pct(updates[`${prefix}max_drawdown_pct`],        `${prefix}max_drawdown_pct`,        0.1, 30),
    pct(updates[`${prefix}profit_target_pct`],       `${prefix}profit_target_pct`,       0, 50),
    pct(updates[`${prefix}max_position_size_pct`],   `${prefix}max_position_size_pct`,   1, 100),
    pct(updates[`${prefix}max_risk_per_trade_pct`],  `${prefix}max_risk_per_trade_pct`,  0.1, 20),
    pct(updates[`${prefix}daily_profit_cap_pct`],    `${prefix}daily_profit_cap_pct`,    0.1, 50),
    posInt(updates[`${prefix}min_trading_days`],     `${prefix}min_trading_days`,        1, 365),
    posInt(updates[`${prefix}max_open_positions`],   `${prefix}max_open_positions`,      1, 500),
    posInt(updates[`${prefix}leverage_max`],         `${prefix}leverage_max`,            1, 200),
  );
}

function validateFundedFields(updates: Record<string, unknown>): string[] {
  return collect(
    ...validatePhaseFields(updates, 'f_'),
    pct(updates.f_consistency_rule_pct,      'f_consistency_rule_pct',      1, 100),
    pct(updates.f_profit_split_initial_pct,  'f_profit_split_initial_pct',  1, 100),
    pct(updates.f_profit_split_scaled_pct,   'f_profit_split_scaled_pct',   1, 100),
    pct(updates.f_payout_threshold_pct,      'f_payout_threshold_pct',      0.1, 50),
  );
}

function validateSharedFields(updates: Record<string, unknown>): string[] {
  return collect(
    time(updates.trading_hours_start, 'trading_hours_start'),
    time(updates.trading_hours_end,   'trading_hours_end'),
    bool(updates.overnight_allowed,   'overnight_allowed'),
    bool(updates.weekend_allowed,     'weekend_allowed'),
    bool(updates.holiday_restriction, 'holiday_restriction'),
    segments(updates.allowed_segments, 'allowed_segments'),
    posInt(updates.inactivity_close_days, 'inactivity_close_days', 1, 365),
  );
}

export function validateOneStepUpdates(updates: Record<string, unknown>): ValidationResult {
  const errors = [
    ...validatePhaseFields(updates, 'e_'),
    ...validateFundedFields(updates),
    ...validateSharedFields(updates),
  ];
  return { valid: errors.length === 0, errors };
}

export function validateTwoStepUpdates(updates: Record<string, unknown>): ValidationResult {
  const errors = [
    ...validatePhaseFields(updates, 'p1_'),
    ...validatePhaseFields(updates, 'p2_'),
    ...validateFundedFields(updates),
    ...validateSharedFields(updates),
  ];
  return { valid: errors.length === 0, errors };
}

const VALIDATORS: Record<string, (u: Record<string, unknown>) => ValidationResult> = {
  flash:   validateFlashUpdates,
  instant: validateInstantUpdates,
  onestep: validateOneStepUpdates,
  twostep: validateTwoStepUpdates,
};

export function validatePlanUpdates(plan: string, updates: Record<string, unknown>): ValidationResult {
  const fn = VALIDATORS[plan];
  if (!fn) return { valid: false, errors: [`Unknown plan: ${plan}`] };
  return fn(updates);
}