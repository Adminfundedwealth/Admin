'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api/fetch';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { LoadingState } from '@/components/shared/loading-state';
import { dateTimeInputToUtc, formatInTimeZone, utcToDateTimeInput } from '@/lib/promotions/time';
import { Plus, RefreshCw, Save, Tag } from 'lucide-react';

const PLAN_TYPES = [
  { key: 'flash', label: 'Flash Funding', color: 'text-yellow-400' },
  { key: 'instant', label: 'Instant Funding', color: 'text-pink-400' },
  { key: '1step', label: '1-Step Evaluation', color: 'text-purple-400' },
  { key: '2step', label: '2-Step Evaluation', color: 'text-emerald-400' },
] as const;

const STATUS_OPTIONS = ['draft', 'scheduled', 'active', 'disabled', 'expired'] as const;
type CampaignStatus = typeof STATUS_OPTIONS[number];
type PlanType = typeof PLAN_TYPES[number]['key'];

interface CampaignRule {
  planType: PlanType;
  code: string;
  discountPct: number;
  enabled: boolean;
}

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  effective_status: CampaignStatus;
  enabled: boolean;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  priority: number | null;
  created_at: string;
  updated_at: string;
  rules: CampaignRule[];
}

interface CampaignHistory {
  id: string;
  campaign_id: string;
  actor_id: string | null;
  event_type: string;
  from_status: string | null;
  to_status: string;
  created_at: string;
}

interface CampaignForm {
  id?: string;
  name: string;
  description: string;
  status: CampaignStatus;
  startsAt: string;
  endsAt: string;
  timezone: string;
  priority: string;
  rules: Record<PlanType, { selected: boolean; codes: string; discountPct: string }>;
}

interface CampaignResponse {
  data: Campaign[];
  history: CampaignHistory[];
}

const blankRules = (): CampaignForm['rules'] => ({
  flash: { selected: false, codes: '', discountPct: '' },
  instant: { selected: false, codes: '', discountPct: '' },
  '1step': { selected: false, codes: '', discountPct: '' },
  '2step': { selected: false, codes: '', discountPct: '' },
});

function makeNewForm(): CampaignForm {
  const timezone = 'Asia/Kolkata';
  const startsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const endsAt = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();
  const rules = blankRules();
  rules['1step'] = { selected: true, codes: '', discountPct: '' };
  return {
    name: '',
    description: '',
    status: 'draft',
    startsAt: utcToDateTimeInput(startsAt, timezone),
    endsAt: utcToDateTimeInput(endsAt, timezone),
    timezone,
    priority: '',
    rules,
  };
}

function formFromCampaign(campaign: Campaign): CampaignForm {
  const rules = blankRules();
  for (const rule of campaign.rules) {
    const plan = rules[rule.planType];
    plan.selected ||= rule.enabled;
    plan.codes = [...plan.codes.split(',').map((code) => code.trim()).filter(Boolean), rule.code]
      .filter(Boolean)
      .join(', ');
    if (!plan.discountPct) plan.discountPct = String(rule.discountPct);
  }
  return {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description || '',
    status: campaign.effective_status,
    startsAt: utcToDateTimeInput(campaign.starts_at, campaign.timezone),
    endsAt: campaign.ends_at ? utcToDateTimeInput(campaign.ends_at, campaign.timezone) : '',
    timezone: campaign.timezone,
    priority: campaign.priority === null ? '' : String(campaign.priority),
    rules,
  };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const body = await response.text();
  if (!body) {
    throw new Error(`The server returned an empty response (HTTP ${response.status})`);
  }
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch {
    throw new Error(`The server returned an invalid response (HTTP ${response.status})`);
  }
  throw new Error(`The server returned an invalid response (HTTP ${response.status})`);
}

function statusStyle(status: CampaignStatus): string {
  if (status === 'active') return 'bg-green-500/15 text-green-500';
  if (status === 'scheduled') return 'bg-blue-500/15 text-blue-400';
  if (status === 'expired') return 'bg-muted text-muted-foreground';
  if (status === 'disabled') return 'bg-orange-500/15 text-orange-400';
  return 'bg-purple-500/15 text-purple-400';
}

export default function DiscountConfigPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [history, setHistory] = useState<CampaignHistory[]>([]);
  const [form, setForm] = useState<CampaignForm | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const saveInFlight = useRef(false);

  const loadCampaigns = useCallback(async (showLoading = true): Promise<boolean> => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/founder/promo-campaigns');
      const payload = await readJson(response);
      if (!response.ok) {
        const apiError = payload.error as { message?: string } | undefined;
        throw new Error(apiError?.message || `Unable to load campaigns (HTTP ${response.status})`);
      }
      if (!Array.isArray(payload.data) || !Array.isArray(payload.history)) {
        throw new Error('The campaign service returned an invalid response');
      }
      const result = payload as unknown as CampaignResponse;
      setCampaigns(result.data);
      setHistory(result.history);
      return true;
    } catch (loadError) {
      console.error('Failed to load promotional campaigns:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Failed to load campaigns');
      return false;
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  const currentCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedId) || null,
    [campaigns, selectedId],
  );
  const campaignHistory = useMemo(
    () => history.filter((event) => event.campaign_id === selectedId),
    [history, selectedId],
  );

  function setField<K extends keyof CampaignForm>(field: K, value: CampaignForm[K]) {
    setForm((current) => current ? { ...current, [field]: value } : current);
    setSaved(false);
  }

  function updatePlan(planType: PlanType, field: 'selected' | 'codes' | 'discountPct', value: boolean | string) {
    setForm((current) => {
      if (!current) return current;
      return {
        ...current,
        rules: {
          ...current.rules,
          [planType]: { ...current.rules[planType], [field]: value },
        },
      };
    });
    setSaved(false);
  }

  function applyToAllPlans() {
    if (!form) return;
    const firstSelected = PLAN_TYPES
      .map(({ key }) => form.rules[key])
      .find((rule) => rule.selected);
    if (!firstSelected || !firstSelected.codes.trim() || !firstSelected.discountPct) {
      setError('Select a plan and enter its code(s) and discount before applying to all plans.');
      return;
    }
    setError('');
    setForm((current) => {
      if (!current) return current;
      return {
        ...current,
        rules: Object.fromEntries(PLAN_TYPES.map(({ key }) => [key, {
          selected: true,
          codes: firstSelected.codes,
          discountPct: firstSelected.discountPct,
        }])) as CampaignForm['rules'],
      };
    });
    setSaved(false);
  }

  function openNewCampaign() {
    setSelectedId(null);
    setForm(makeNewForm());
    setError('');
    setSaved(false);
  }

  function openCampaign(campaign: Campaign) {
    setSelectedId(campaign.id);
    setForm(formFromCampaign(campaign));
    setError('');
    setSaved(false);
  }

  async function saveCampaign(saveAsDraft = false, forceExpired = false) {
    if (!form || saveInFlight.current) return;
    saveInFlight.current = true;
    setSaving(true);
    setError('');
    setSaved(false);

    try {
      const startsAt = dateTimeInputToUtc(form.startsAt, form.timezone);
      const endsAt = form.endsAt ? dateTimeInputToUtc(form.endsAt, form.timezone) : null;
      if (!startsAt || (form.endsAt && !endsAt)) {
        throw new Error('Enter a valid start and end date/time.');
      }
      if (endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
        throw new Error('End date/time must be later than start date/time.');
      }

      const rules = PLAN_TYPES
        .filter(({ key }) => form.rules[key].selected)
        .flatMap(({ key }) => {
          const rule = form.rules[key];
          return rule.codes
            .split(/[,\n;]/)
            .map((code) => code.trim().toUpperCase())
            .filter(Boolean)
            .map((code) => ({
              planType: key,
              code,
              discountPct: Number(rule.discountPct),
            }));
        });
      if (rules.length === 0) throw new Error('Select at least one applicable plan.');
      const duplicateRule = rules.some((rule, index) => rules.some((other, otherIndex) => (
        otherIndex < index && other.planType === rule.planType && other.code === rule.code
      )));
      if (duplicateRule || rules.some((rule) => !/^[A-Z0-9_-]{2,30}$/.test(rule.code) || !Number.isInteger(rule.discountPct))) {
        throw new Error('Enter unique valid promo code(s) and a discount percentage for each selected plan.');
      }

      const status: CampaignStatus = forceExpired
        ? 'expired'
        : saveAsDraft
          ? 'draft'
          : form.status === 'expired'
            ? 'expired'
            : form.status;
      const payload = {
        ...(form.id ? { id: form.id } : {}),
        name: form.name.trim(),
        description: form.description.trim() || null,
        status,
        startsAt,
        endsAt,
        timezone: form.timezone.trim(),
        priority: form.priority.trim() ? Number(form.priority) : null,
        rules,
      };

      const response = await apiFetch('/api/founder/promo-campaigns', {
        method: form.id ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      const responsePayload = await readJson(response);
      if (!response.ok) {
        const apiError = responsePayload.error as { message?: string } | undefined;
        throw new Error(apiError?.message || `Save failed (HTTP ${response.status})`);
      }
      if (!responsePayload.data || typeof responsePayload.data !== 'object') {
        throw new Error('The save response did not confirm a persisted campaign.');
      }

      const savedCampaign = responsePayload.data as Campaign;
      setSelectedId(savedCampaign.id);
      const refreshed = await loadCampaigns(false);
      if (!refreshed) throw new Error('The campaign was saved, but the refreshed configuration could not be loaded.');
      setSaved(true);
      setTimeout(() => setSaved(false), 3500);
    } catch (saveError) {
      console.error('Failed to save promotional campaign:', saveError);
      setError(saveError instanceof Error ? saveError.message : 'Failed to save campaign');
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }

  if (loading) return <LoadingState rows={6} />;
  if (error && campaigns.length === 0 && !form) {
    return <ErrorState message={error} onRetry={() => void loadCampaigns()} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <Tag className="h-7 w-7 text-primary" />
            Promotional Campaigns
          </h1>
          <p className="mt-1 text-muted-foreground">
            Create campaigns once; the public site and checkout apply them by schedule.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadCampaigns()} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button size="sm" onClick={openNewCampaign} className="gap-2">
            <Plus className="h-4 w-4" /> New campaign
          </Button>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {campaigns.map((campaign) => (
          <button
            type="button"
            key={campaign.id}
            onClick={() => openCampaign(campaign)}
            className={`rounded-lg border p-4 text-left transition-colors hover:bg-accent/40 ${
              selectedId === campaign.id ? 'border-primary bg-accent/20' : 'border-border'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold">{campaign.name}</span>
              <span className={`rounded px-2 py-0.5 text-xs capitalize ${statusStyle(campaign.effective_status)}`}>
                {campaign.effective_status}
              </span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {formatInTimeZone(campaign.starts_at, campaign.timezone)}
              {' — '}
              {campaign.ends_at ? formatInTimeZone(campaign.ends_at, campaign.timezone) : 'No end date'}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {campaign.rules.filter((rule) => rule.enabled).map((rule) => (
              <span key={`${rule.planType}-${rule.code}`} className="rounded bg-muted px-2 py-0.5 text-xs">
                  {rule.code} · {rule.discountPct}% · {rule.planType}
                </span>
              ))}
            </div>
          </button>
        ))}
        {campaigns.length === 0 && (
          <div className="md:col-span-2 xl:col-span-3">
            <EmptyState message="No campaigns have been configured yet." />
          </div>
        )}
      </section>

      {form && (
        <Card>
          <CardHeader>
            <CardTitle>{form.id ? 'Edit campaign' : 'Create campaign'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="campaign-name" className="text-sm font-medium">Campaign Name</label>
                <Input
                  id="campaign-name"
                  value={form.name}
                  maxLength={120}
                  onChange={(event) => setField('name', event.target.value)}
                  disabled={saving}
                  placeholder="Name this campaign"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="campaign-timezone" className="text-sm font-medium">Time Zone</label>
                <Input
                  id="campaign-timezone"
                  value={form.timezone}
                  onChange={(event) => setField('timezone', event.target.value)}
                  disabled={saving}
                  placeholder="Asia/Kolkata"
                />
                <p className="text-xs text-muted-foreground">New campaigns default to Asia/Kolkata.</p>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label htmlFor="campaign-description" className="text-sm font-medium">Description</label>
                <Input
                  id="campaign-description"
                  value={form.description}
                  maxLength={2000}
                  onChange={(event) => setField('description', event.target.value)}
                  disabled={saving}
                  placeholder="Optional internal campaign notes"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="campaign-start" className="text-sm font-medium">Start Date &amp; Time</label>
                <Input
                  id="campaign-start"
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(event) => setField('startsAt', event.target.value)}
                  disabled={saving}
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="campaign-end" className="text-sm font-medium">End Date &amp; Time</label>
                <Input
                  id="campaign-end"
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(event) => setField('endsAt', event.target.value)}
                  disabled={saving}
                />
                <p className="text-xs text-muted-foreground">Leave blank only for a campaign without an end time.</p>
              </div>
              <div className="space-y-2">
                <label htmlFor="campaign-priority" className="text-sm font-medium">Priority</label>
                <Input
                  id="campaign-priority"
                  type="number"
                  value={form.priority}
                  onChange={(event) => setField('priority', event.target.value)}
                  disabled={saving}
                  placeholder="Only required for overlapping campaigns"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="campaign-status" className="text-sm font-medium">Campaign Status</label>
                <select
                  id="campaign-status"
                  value={form.status}
                  onChange={(event) => setField('status', event.target.value as CampaignStatus)}
                  disabled={saving}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold">Applicable Plans</h3>
                  <p className="text-xs text-muted-foreground">Configure a separate code and discount for each plan.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={applyToAllPlans} disabled={saving}>
                  Apply to all plans
                </Button>
              </div>

              <div className="space-y-3">
                {PLAN_TYPES.map(({ key, label, color }) => {
                  const rule = form.rules[key];
                  return (
                    <div key={key} className="grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1.2fr_0.7fr]">
                      <label className="flex min-h-10 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={rule.selected}
                          onChange={(event) => updatePlan(key, 'selected', event.target.checked)}
                          disabled={saving}
                        />
                        <span className={`font-medium ${color}`}>{label}</span>
                      </label>
                      <div className="space-y-1">
                        <label htmlFor={`code-${key}`} className="text-xs text-muted-foreground">Promo Codes</label>
                        <Input
                          id={`code-${key}`}
                          value={rule.codes}
                          onChange={(event) => updatePlan(key, 'codes', event.target.value.toUpperCase())}
                          disabled={saving || !rule.selected}
                          placeholder="Codes separated by commas"
                          className="font-mono uppercase"
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor={`discount-${key}`} className="text-xs text-muted-foreground">Discount %</label>
                        <Input
                          id={`discount-${key}`}
                          type="number"
                          min={1}
                          max={99}
                          value={rule.discountPct}
                          onChange={(event) => updatePlan(key, 'discountPct', event.target.value)}
                          disabled={saving || !rule.selected}
                          placeholder="1–99"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t pt-4">
              <Button onClick={() => void saveCampaign()} disabled={saving} className="gap-2">
                <Save className="h-4 w-4" />
                {saving ? 'Saving…' : 'Save Changes'}
              </Button>
              <Button variant="outline" onClick={() => void saveCampaign(true)} disabled={saving}>
                Save as Draft
              </Button>
              {form.id && form.status !== 'expired' && (
                <Button variant="outline" onClick={() => void saveCampaign(false, true)} disabled={saving}>
                  Expire Now
                </Button>
              )}
              {saved && <span className="text-sm font-medium text-green-500">Saved and reloaded.</span>}
              {error && <span role="alert" className="text-sm text-red-500">{error}</span>}
            </div>
          </CardContent>
        </Card>
      )}

      {currentCampaign && (
        <Card>
          <CardHeader>
            <CardTitle>Campaign History</CardTitle>
          </CardHeader>
          <CardContent>
            {campaignHistory.length === 0 ? (
              <EmptyState message="No history entries for this campaign." />
            ) : (
              <div className="divide-y">
                {campaignHistory.map((event) => (
                  <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <div>
                      <span className="font-medium">{event.event_type.replaceAll('_', ' ')}</span>
                      <span className="ml-2 text-muted-foreground">
                        {event.from_status ? `${event.from_status} → ` : ''}{event.to_status}
                      </span>
                    </div>
                    <time className="text-xs text-muted-foreground">
                      {formatInTimeZone(event.created_at, currentCampaign.timezone)}
                    </time>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
