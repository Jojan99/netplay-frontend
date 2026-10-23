export interface UserInterface {
    names?: string
    id_user?: string
    lastname?: string
    address?: string
    dni?: string
    email?: string
    alias?: string
    phone?: string
    internet_status?: string
    category?: string
    plan_name?: string
    plan_id?: number
    periode_facturation?: number
    countries?: number
    id_cab?: number
    ip?: number
    mac?: string
    shear?: string
    date_create?: string
    isMenuOpen ?: boolean,
    showDetails?: boolean
    expanded?: boolean
    whatsapp_enabled?: boolean
    billing_electronic?: number | boolean
    vlan?: number
    router_id?: number | null
    /** 'static' (IP fija) o 'pppoe'. Un cliente PPPoE no tiene IP fija: la recibe al conectarse. */
    /** Lo que piden la DIAN y Alegra del cliente. */
    tipo_documento?: string
    estrato?: number | null
    barrio?: string
    ciudad?: string
    departamento?: string
    pais?: string
    municipio?: string
    prefijo_telefono?: string
    connection_type?: string | null
    /** Sin facturas por pagar (la pestaña «Pagó y sigue suspendido» dice por qué está ahí). */
    al_dia?: boolean
    /** Lo que debe, en pesos, y en cuántas facturas (la lista lo trae ya calculado). */
    deuda?: number
    facturas_pendientes?: number
    /** Los últimos 6 meses, el más viejo primero: a_tiempo | tarde | debe | por_pagar | sin. */
    pagos?: { mes: string; estado: string }[]
    monthly_price?: number | null
    ultimo_pago?: string | null
    ont_estado?: string | null
    ont_puerto?: string | null
    tickets_abiertos?: number
    pppoe_user?: string | null
    pppoe_password?: string | null
    pppoe_profile?: string | null



}