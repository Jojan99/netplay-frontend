import { InventoryCategoryInterface } from './inventory-category.interface';
import { InventoryMovementInterface } from './inventory-movement.interface';

export interface InventoryItemInterface {
  id?: number;
  company_id?: number;
  category_id?: number;
  category?: InventoryCategoryInterface;
  name?: string;
  description?: string;
  sku?: string;
  code?: string;
  quantity?: number;
  stock_min?: number;
  stock_max?: number;
  unit_price?: number;
  average_cost?: number;
  unit?: string;
  location?: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string;
  movements?: InventoryMovementInterface[];
  total_in?: number;
  total_out?: number;
}
