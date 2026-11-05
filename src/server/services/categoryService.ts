const crypto = globalThis.crypto;
import { query } from '../db/pool';
import { AppError } from '../middleware/error';
import type { Category } from '../../shared/types';

function mapCategoryRow(row: any): Category {
  return {
    id: row.id,
    householdId: row.household_id,
    parentId: row.parent_id,
    name: row.name,
    type: row.type,
    defaultEssentiality: Boolean(row.default_essentiality),
    isFixedDefault: Boolean(row.is_fixed_default),
    icon: row.icon,
    color: row.color,
    isSystemSeeded: Boolean(row.is_system_seeded),
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order),
  };
}

export async function listCategories(householdId: string): Promise<Category[]> {
  const res = await query(
    `SELECT * FROM categories
     WHERE household_id = $1 AND is_active = TRUE
     ORDER BY sort_order ASC, name ASC`,
    [householdId]
  );

  const all = res.rows.map(mapCategoryRow);
  const parents = all.filter((c) => !c.parentId);
  const childrenByParent = new Map<string, Category[]>();

  for (const c of all) {
    if (c.parentId) {
      const list = childrenByParent.get(c.parentId) || [];
      list.push(c);
      childrenByParent.set(c.parentId, list);
    }
  }

  return parents.map((p) => ({
    ...p,
    subcategories: childrenByParent.get(p.id) || [],
  }));
}

export async function createCategory(
  householdId: string,
  input: {
    parentId?: string | null;
    name: string;
    type: 'INCOME' | 'EXPENSE';
    defaultEssentiality?: boolean;
    isFixedDefault?: boolean;
    icon?: string;
    color?: string;
    sortOrder?: number;
  }
): Promise<Category> {
  const id = crypto.randomUUID();
  const res = await query(
    `INSERT INTO categories (
      id, household_id, parent_id, name, type, default_essentiality, is_fixed_default, icon, color, is_system_seeded, sort_order
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE, $10)
    RETURNING *`,
    [
      id,
      householdId,
      input.parentId || null,
      input.name.trim(),
      input.type,
      input.defaultEssentiality ?? true,
      input.isFixedDefault ?? false,
      input.icon || 'Tag',
      input.color || '#3b82f6',
      input.sortOrder ?? 100,
    ]
  );
  return mapCategoryRow(res.rows[0]);
}

export async function updateCategory(
  householdId: string,
  categoryId: string,
  input: Partial<{
    name: string;
    defaultEssentiality: boolean;
    isFixedDefault: boolean;
    icon: string;
    color: string;
    isActive: boolean;
    sortOrder: number;
  }>
): Promise<Category> {
  const existing = await query('SELECT * FROM categories WHERE id = $1 AND household_id = $2', [
    categoryId,
    householdId,
  ]);
  if (!existing.rows[0]) {
    throw new AppError('Category not found', 404);
  }
  const curr = existing.rows[0];

  const res = await query(
    `UPDATE categories
     SET name = $1,
         default_essentiality = $2,
         is_fixed_default = $3,
         icon = $4,
         color = $5,
         is_active = $6,
         sort_order = $7
     WHERE id = $8 AND household_id = $9
     RETURNING *`,
    [
      input.name !== undefined ? input.name.trim() : curr.name,
      input.defaultEssentiality !== undefined ? input.defaultEssentiality : curr.default_essentiality,
      input.isFixedDefault !== undefined ? input.isFixedDefault : curr.is_fixed_default,
      input.icon !== undefined ? input.icon : curr.icon,
      input.color !== undefined ? input.color : curr.color,
      input.isActive !== undefined ? input.isActive : curr.is_active,
      input.sortOrder !== undefined ? input.sortOrder : curr.sort_order,
      categoryId,
      householdId,
    ]
  );
  return mapCategoryRow(res.rows[0]);
}

