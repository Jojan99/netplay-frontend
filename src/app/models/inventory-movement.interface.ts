import { InventoryItemInterface } from './inventory-item.interface';

export interface InventoryMovementInterface {
  id?: number;
  company_id?: number;
  inventory_id?: number;
  inventory?: InventoryItemInterface;
  type?: 'entrada' | 'salida' | 'ajuste';
  quantity?: number;
  unit_price?: number;
  balance_after?: number;
  cost_before?: number;
  cost_after?: number;
  description?: string;
  reference?: string;
  batch_number?: string;
  expiry_date?: string;
  user_id?: number;
  user?: { id?: number; username?: string; names?: string };
  created_at?: string;
  updated_at?: string;
}
