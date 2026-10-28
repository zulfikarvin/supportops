import { roles, type Role } from './roles';
export const DEMO_COOKIE = 'supportops-demo-role';
export function isDemoMode() { return (process.env.SUPPORTOPS_AUTH_MODE ?? 'demo') === 'demo'; }
export function parseDemoRole(value: unknown): Role | null {
  return typeof value === 'string' && roles.includes(value as Role) ? value as Role : null;
}
export const demoRoles = [
  { role: 'customer', title: 'Customer', name: 'Atlas Customer', team: 'Atlas Industries', description: 'Report issues, follow progress, and confirm resolutions.' },
  { role: 'support_analyst', title: 'Technical Support Analyst', name: 'Alex Morgan', team: 'Technical Support', description: 'Triage tickets, investigate problems, and coordinate escalations.' },
  { role: 'customer_success', title: 'Customer Success Manager', name: 'Sam Rivera', team: 'Customer Success', description: 'Keep customers informed and coordinate their requests.' },
  { role: 'data_engineer', title: 'Data Engineer', name: 'Jordan Chen', team: 'Data Engineering', description: 'Investigate uploads, data validation, and pipeline issues.' },
  { role: 'product_tech', title: 'Product & Tech', name: 'Taylor Brooks', team: 'Product & Tech', description: 'Investigate product bugs and document technical fixes.' },
] as const;
