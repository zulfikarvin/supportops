import { requireUser } from '@/lib/auth';
import { logout } from '@/app/login/actions';
import { Button } from '@/components/ui/button';
import { isDemoMode } from '@/lib/demo';
import { DemoWorkspace } from '@/components/demo-workspace';
export const dynamic = 'force-dynamic';
export default async function Workspace() {
  if (isDemoMode()) return <DemoWorkspace/>;
  const { client, profile } = await requireUser();
  const { data: memberships, error } = await client.from('organization_memberships').select('organization_id, organizations(name)');
  if (error) throw new Error('Unable to load organization access.');
  return <main className="mx-auto max-w-5xl px-6 py-12"><header className="flex items-center justify-between"><span className="text-xl font-bold">SupportOps</span><form action={logout}><Button variant="outline">Sign out</Button></form></header><section className="mt-12 rounded-xl border border-slate-200 bg-white p-8"><p className="text-sm font-medium text-teal-700">Authenticated workspace</p><h1 className="mt-3 text-3xl font-semibold">Welcome, {profile.display_name}</h1><dl className="mt-8 grid gap-6 sm:grid-cols-2"><div><dt className="text-sm text-slate-500">Assigned role</dt><dd className="mt-1 font-medium">{profile.role.replaceAll('_', ' ')}</dd></div><div><dt className="text-sm text-slate-500">Organization memberships</dt><dd className="mt-1 font-medium">{memberships?.length ?? 0}</dd></div></dl><p className="mt-8 border-t border-slate-100 pt-6 text-sm text-slate-600">Phase 1 foundation. Ticket creation, investigation, and reporting will be implemented in the next phase.</p></section></main>;
}
