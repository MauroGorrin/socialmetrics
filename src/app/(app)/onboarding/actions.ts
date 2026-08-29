'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { PLATFORMS, REPORT_PROFILES } from '@/lib/client-profile';
import {
  advanceOnboarding,
  clearOnboarding,
  readOnboarding,
  seedMetricRows,
} from '@/lib/onboarding';
import { db } from '@/server/db';
import { metrics } from '@/server/db/schema';
import { ensurePersonalOrg } from '@/server/mutations/auth';
import { createClient, updateClient } from '@/server/mutations/clients';
import { generateReport } from '@/server/mutations/reports';
import { renameOrg } from '@/server/mutations/orgs';
import { getOrgBySlug, listOrgsByUser } from '@/server/queries/orgs';

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/signin?redirect=/onboarding');
  return user;
}

export async function submitOrgNameAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = z.string().trim().min(1).max(80).safeParse(str(formData, 'orgName'));
  if (!parsed.success) redirect('/onboarding/step-1?error=name');

  const orgs = await listOrgsByUser(user.id);
  let orgSlug: string;
  if (orgs[0]) {
    orgSlug = orgs[0].slug;
    await renameOrg(orgSlug, user.id, parsed.data);
  } else {
    orgSlug = await ensurePersonalOrg({
      id: user.id,
      email: user.email ?? '',
      name: parsed.data,
    });
  }

  advanceOnboarding({
    step: Math.max(2, readOnboarding().step),
    orgSlug,
    orgName: parsed.data,
  });
  redirect('/onboarding/step-2');
}

export async function submitClientAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const state = readOnboarding();
  if (!state.orgSlug) redirect('/onboarding/step-1');

  const parsed = z
    .object({
      name: z.string().trim().min(1).max(120),
      platform: z.enum(PLATFORMS),
      profile: z.enum(REPORT_PROFILES),
    })
    .safeParse({
      name: str(formData, 'clientName'),
      platform: str(formData, 'clientPlatform'),
      profile: str(formData, 'clientProfile') || 'ads',
    });
  if (!parsed.success) redirect('/onboarding/step-2?error=client');

  const org = await getOrgBySlug(state.orgSlug);
  if (!org) redirect('/onboarding/step-1');

  let clientId = state.clientId;
  if (clientId) {
    await updateClient(org.id, clientId, {
      name: parsed.data.name,
      platform: parsed.data.platform,
      reportProfile: parsed.data.profile,
    });
  } else {
    const client = await createClient({
      orgId: org.id,
      createdBy: user.id,
      name: parsed.data.name,
      platform: parsed.data.platform,
      reportProfile: parsed.data.profile,
    });
    clientId = client.id;
  }

  advanceOnboarding({
    step: Math.max(3, readOnboarding().step),
    clientId,
    clientName: parsed.data.name,
    clientPlatform: parsed.data.platform,
    clientProfile: parsed.data.profile,
  });
  redirect('/onboarding/step-3');
}

export async function seedMetricsAction(): Promise<void> {
  const user = await requireUser();
  const state = readOnboarding();
  if (!state.orgSlug || !state.clientId) redirect('/onboarding/step-2');

  const org = await getOrgBySlug(state.orgSlug);
  if (!org) redirect('/onboarding/step-1');

  const periodMonth = state.periodMonth ?? currentMonth();

  if (!state.metricsSeeded) {
    await db.insert(metrics).values(
      seedMetricRows({
        orgId: org.id,
        clientId: state.clientId,
        createdBy: user.id,
        periodMonth,
        profile: state.clientProfile,
      }),
    );
  }

  advanceOnboarding({
    step: Math.max(4, readOnboarding().step),
    metricsSeeded: true,
    periodMonth,
  });
  redirect('/onboarding/step-4');
}

export async function generateOnboardingReportAction(): Promise<void> {
  const user = await requireUser();
  const state = readOnboarding();
  if (!state.orgSlug || !state.clientId || !state.metricsSeeded || !state.periodMonth) {
    redirect('/onboarding/step-3');
  }

  const org = await getOrgBySlug(state.orgSlug);
  if (!org) redirect('/onboarding/step-1');

  const result = await generateReport({
    orgId: org.id,
    orgName: org.name,
    actorId: user.id,
    periodMonth: state.periodMonth,
    clientIds: [state.clientId],
  });
  if (!result.ok) redirect('/onboarding/step-4?error=report');

  advanceOnboarding({ step: 5, reportId: result.data.reportId });
  redirect('/onboarding/step-5');
}

export async function finishOnboardingAction(): Promise<void> {
  await requireUser();
  const state = readOnboarding();
  if (!state.orgSlug || !state.reportId) redirect('/onboarding/step-4');

  const target = `/${state.orgSlug}/reports/${state.reportId}`;
  clearOnboarding();
  redirect(target);
}
