export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedStaff } from '@/lib/auth/get-staff';
import { createAdminClient } from '@/lib/supabase/admin';

const PLAN_TYPES = ['flash', 'instant', '1step', '2step'] as const;
const campaignSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(['draft', 'scheduled', 'active', 'expired', 'disabled']),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).nullable(),
  timezone: z.string().min(1).max(100).default('Asia/Kolkata'),
  priority: z.number().int().nullable(),
  rules: z.array(z.object({
    planType: z.enum(PLAN_TYPES),
    code: z.string().trim().min(2).max(30).regex(/^[A-Z0-9_-]+$/i),
    discountPct: z.number().int().min(1).max(99),
  })).min(1),
}).superRefine((campaign, context) => {
  const seenRules = new Set<string>();
  const discountsByPlan = new Map<string, number>();
  campaign.rules.forEach((rule, index) => {
    const key = `${rule.planType}:${rule.code.toUpperCase()}`;
    if (seenRules.has(key)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A promo code can only be listed once for each plan',
        path: ['rules', index, 'code'],
      });
    }
    seenRules.add(key);

    const existingDiscount = discountsByPlan.get(rule.planType);
    if (existingDiscount !== undefined && existingDiscount !== rule.discountPct) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'All promo codes for the same plan must use the same discount percentage',
        path: ['rules', index, 'discountPct'],
      });
    }
    discountsByPlan.set(rule.planType, rule.discountPct);
  });
});

type CampaignStatus = z.infer<typeof campaignSchema>['status'];

function getEffectiveStatus(
  status: CampaignStatus,
  enabled: boolean,
  startsAt: string,
  endsAt: string | null,
  now: number,
): CampaignStatus {
  if (status === 'expired') return 'expired';
  if (status === 'draft') return 'draft';
  if (!enabled || status === 'disabled') return 'disabled';
  if (endsAt && new Date(endsAt).getTime() <= now) return 'expired';
  if (new Date(startsAt).getTime() > now) return 'scheduled';
  return 'active';
}

async function requireFounder() {
  const actor = await getAuthenticatedStaff();
  if (!actor || !actor.isFullAccess) {
    return {
      actor: null,
      response: NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Founder access required' } },
        { status: 403 },
      ),
    };
  }
  return { actor, response: null };
}

export async function GET() {
  const auth = await requireFounder();
  if (auth.response) return auth.response;

  try {
    const supabase = createAdminClient();
    const [campaignResult, ruleResult, codeResult, historyResult] = await Promise.all([
      supabase.from('promo_campaigns').select('*').order('created_at', { ascending: false }),
      supabase.from('promo_campaign_plan_eligibility').select('*'),
      supabase.from('promo_codes').select('id, campaign_id, code'),
      supabase.from('promo_campaign_history')
        .select('id, campaign_id, actor_id, event_type, from_status, to_status, details, created_at')
        .order('created_at', { ascending: false })
        .limit(250),
    ]);

    const queryError = campaignResult.error || ruleResult.error || codeResult.error || historyResult.error;
    if (queryError) {
      console.error('Campaign manager load failed:', {
        code: queryError.code,
        message: queryError.message,
      });
      return NextResponse.json(
        { error: { code: 'CAMPAIGNS_UNAVAILABLE', message: 'Campaign configuration could not be loaded' } },
        { status: 500 },
      );
    }

    const codesById = new Map((codeResult.data || []).map((code) => [code.id, code]));
    const rulesByCampaign = new Map<string, Array<Record<string, unknown>>>();
    for (const rule of ruleResult.data || []) {
      const code = codesById.get(rule.promo_code_id);
      const rules = rulesByCampaign.get(rule.campaign_id) || [];
      rules.push({
        planType: rule.plan_type,
        code: code?.code ?? '',
        discountPct: rule.discount_pct,
        enabled: rule.enabled,
      });
      rulesByCampaign.set(rule.campaign_id, rules);
    }

    const now = Date.now();
    const campaigns = (campaignResult.data || []).map((campaign) => ({
      ...campaign,
      effective_status: getEffectiveStatus(
        campaign.status,
        campaign.enabled,
        campaign.starts_at,
        campaign.ends_at,
        now,
      ),
      rules: rulesByCampaign.get(campaign.id) || [],
    }));

    return NextResponse.json({
      data: campaigns,
      history: historyResult.data || [],
      meta: { totalCount: campaigns.length },
    });
  } catch (error) {
    console.error('Campaign manager GET failed:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Campaign configuration could not be loaded' } },
      { status: 500 },
    );
  }
}

async function saveCampaign(request: NextRequest, updating: boolean) {
  const auth = await requireFounder();
  if (auth.response) return auth.response;

  try {
    const body: unknown = await request.json();
    const parsed = campaignSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid campaign' } },
        { status: 400 },
      );
    }
    if (updating && !parsed.data.id) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Campaign ID is required for updates' } },
        { status: 400 },
      );
    }
    if (!updating && parsed.data.id) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Do not provide an ID when creating a campaign' } },
        { status: 400 },
      );
    }
    if (
      parsed.data.endsAt &&
      new Date(parsed.data.endsAt).getTime() <= new Date(parsed.data.startsAt).getTime()
    ) {
      return NextResponse.json(
        { error: { code: 'INVALID_SCHEDULE', message: 'Campaign end must be later than its start' } },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const { data: savedId, error } = await supabase.rpc('save_promo_campaign', {
      p_campaign_id: parsed.data.id || null,
      p_name: parsed.data.name,
      p_description: parsed.data.description || null,
      p_enabled: ['scheduled', 'active'].includes(parsed.data.status),
      p_starts_at: parsed.data.startsAt,
      p_ends_at: parsed.data.endsAt,
      p_timezone: parsed.data.timezone,
      p_priority: parsed.data.priority,
      p_status: parsed.data.status,
      p_rules: parsed.data.rules.map((rule) => ({
        ...rule,
        code: rule.code.toUpperCase(),
      })),
      p_actor_id: auth.actor!.id,
    });

    if (error || typeof savedId !== 'string') {
      const conflict = error?.code === '23P01';
      const invalid = error?.code === '22023';
      console.error('Campaign save failed:', {
        code: error?.code,
        message: error?.message,
      });
      return NextResponse.json(
        {
          error: {
            code: conflict ? 'CAMPAIGN_OVERLAP' : invalid ? 'INVALID_CAMPAIGN' : 'CAMPAIGN_SAVE_FAILED',
            message: conflict
              ? 'Another enabled campaign overlaps these plans. Set a distinct priority for each overlapping campaign.'
              : invalid
                ? error?.message || 'Campaign details are invalid'
                : 'Campaign was not saved. Please try again.',
          },
        },
        { status: conflict ? 409 : invalid ? 400 : 500 },
      );
    }

    const { data: campaign, error: readError } = await supabase
      .from('promo_campaigns')
      .select('*')
      .eq('id', savedId)
      .single();

    if (readError || !campaign) {
      console.error('Campaign save verification failed:', {
        code: readError?.code,
        message: readError?.message,
      });
      return NextResponse.json(
        { error: { code: 'CAMPAIGN_VERIFY_FAILED', message: 'Campaign save could not be verified' } },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: campaign }, { status: updating ? 200 : 201 });
  } catch (error) {
    console.error('Campaign save request failed:', error);
    return NextResponse.json(
      { error: { code: 'CAMPAIGN_SAVE_FAILED', message: 'Campaign was not saved. Please try again.' } },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return saveCampaign(request, false);
}

export async function PUT(request: NextRequest) {
  return saveCampaign(request, true);
}
