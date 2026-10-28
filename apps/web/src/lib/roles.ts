export const roles = ['customer', 'support_analyst', 'customer_success', 'data_engineer', 'product_tech'] as const;
export type Role = typeof roles[number];
export function isInternal(role: Role) { return role !== 'customer'; }
export function canTriage(role: Role) { return role === 'support_analyst'; }
export function canInvestigate(role: Role) { return ['support_analyst', 'data_engineer', 'product_tech'].includes(role); }
