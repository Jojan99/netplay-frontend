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
    vlan?: number
    router_id?: number | null
    /** 'static' (IP fija) o 'pppoe'. Un cliente PPPoE no tiene IP fija: la recibe al conectarse. */
    connection_type?: string | null
    pppoe_user?: string | null
    pppoe_password?: string | null
    pppoe_profile?: string | null



}