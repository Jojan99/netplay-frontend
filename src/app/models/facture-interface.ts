export interface FactureInterface {
    names?: string
    lastname?: string
    date_facturation?: string
    updated_at?: string
    number_facture?: string
    price_total?: number
    id?: number
    idUser?: number
    monthPedding?: number
    cab_id?: number
    price_discount?: number
    number?:number
    paid?:number
    prueba?:number
    restante?:number
    descripcion?:number
    id_status_facture?:number
    _waSending?:boolean
    /** Cuándo se pagó, tal como lo guardó el movimiento. */
    paid_at?: string | null
    /** Con qué se pagó: sale del último movimiento de la factura. */
    metodo_pago?: string | null
    /** Referencia de la transferencia, número de recibo, lo que se anotó. */
    observacion?: string | null
    /** Anulada: sigue a la vista, pero deja de contar en la cartera. */
    anulada_en?: string | null
    anulada_motivo?: string | null
}