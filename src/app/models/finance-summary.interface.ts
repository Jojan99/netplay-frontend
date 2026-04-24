export interface FinanceSummaryInterface {
  valor_ingreso?: number;
  valor_abone?: number;
  total_sum?: number;
  total_egresses?: number;
  total_inventory_egresses?: number;
  total_gastos?: number;
  net_value?: number;
}

export interface IngresoDetalleInterface {
  id?: number;
  number_facture?: string;
  date_facturation?: string;
  price_total?: number;
  price_abone?: number;
  price_discount?: number;
  abone?: 0 | 1;
  paid?: 0 | 1;
  created_at?: string;
  user_id?: number;
  cliente?: string;
}
