export interface InventoryMovementInterface {
  id?: number;
  inventory_id?: number;
  type?: 'entrada' | 'salida' | 'ajuste';
  quantity?: number;
  unit_price?: number;
  description?: string;
  reference?: string;
  created_at?: string;
}
