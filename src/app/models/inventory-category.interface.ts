export interface InventoryCategoryInterface {
  /** Por serial (ONT, TV box) o por cantidad (conectores, RJ45). */
  usa_serial?: boolean | number;
  id?: number;
  name?: string;
  description?: string;
  inventories_count?: number;
  created_at?: string;
  updated_at?: string;
}
