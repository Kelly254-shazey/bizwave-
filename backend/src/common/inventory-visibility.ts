import { TenantAuthContext } from './types/auth.types';

/** Financial costs are visible only to roles that can read finance. A zero cost
 * in the legacy product schema may mean “not supplied”, so never present it as
 * a verified valuation. */
export function inventoryRowForRole(row: any, ctx: TenantAuthContext): any {
  const { cost_price, inventory_value_cost, ...operational } = row;
  if (!ctx.permissions.includes('finance:read')) return operational;
  const known = cost_price !== null && cost_price !== undefined && Number(cost_price) > 0;
  return { ...operational, cost_price: known ? cost_price : null, inventory_value_cost: known ? inventory_value_cost : null };
}

export function inventoryMovementForRole(row: any, ctx: TenantAuthContext): any {
  const { unit_cost, ...operational } = row;
  if (!ctx.permissions.includes('finance:read')) return operational;
  return { ...operational, unit_cost: Number(unit_cost) > 0 ? unit_cost : null };
}

export function saleForRole(row: any, ctx: TenantAuthContext): any {
  if (ctx.permissions.includes('finance:read')) return row;
  const { cost_of_goods_sold, cost_basis, ...operational } = row;
  return operational;
}
