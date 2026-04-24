import { InventoryCategoryInterface } from './inventory-category.interface';
import { InventoryMovementInterface } from './inventory-movement.interface';

export interface InventoryItemInterface {
  id?: number;
  name?: string;
  description?: string;
  category_id?: number;
  category?: InventoryCategoryInterface;
  quantity?: number;
  unit_price?: number;
  unit?: string;
  created_at?: string;
  movements?: InventoryMovementInterface[];
}
