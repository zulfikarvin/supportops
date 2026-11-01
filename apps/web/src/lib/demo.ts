import { roles, type Role } from './roles';
export const DEMO_COOKIE = 'supportops-demo-role';
export function isLocalDemoMode() { return (process.env.SUPPORTOPS_AUTH_MODE ?? 'demo') === 'demo'; }
export function isPortfolioMode() { return process.env.SUPPORTOPS_AUTH_MODE === 'portfolio'; }
export function isDemoMode() { return isLocalDemoMode() || isPortfolioMode(); }
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
// Fixed synthetic identities only. Requests cannot supply an email or account ID.
export const portfolioPersonas = demoRoles.map((person, index) => ({ ...person, id: `50000000-0000-4000-8000-00000000000${index + 1}`, email: `portfolio-${person.role}@demo.supportops.example` }));
