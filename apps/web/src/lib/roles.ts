export const roles = ['customer', 'support_analyst', 'customer_success', 'data_engineer', 'product_tech'] as const;
export type Role = typeof roles[number];
export const roleNames: Record<Role, string> = {
 customer: 'Customer', support_analyst: 'Technical Support Analyst', customer_success: 'Customer Success Manager', data_engineer: 'Data Engineer', product_tech: 'Product & Tech',
};
export const workspaceNames: Record<Role, string> = {
 customer: 'Customer Portal', support_analyst: 'Technical Support Analyst Workspace', customer_success: 'Customer Success Manager Workspace', data_engineer: 'Data Engineering Workspace', product_tech: 'Product & Tech Workspace',
};
export function isInternal(role: Role) { return role !== 'customer'; }
export function canTriage(role: Role) { return role === 'support_analyst'; }
export function canInvestigate(role: Role) { return ['support_analyst', 'data_engineer', 'product_tech'].includes(role); }
