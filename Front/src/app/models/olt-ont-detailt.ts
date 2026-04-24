export interface OltOntDetailInterface {
    FS_P?: string
    ontId?: number
    sn: string
    controlFlag?: string
    runState?: string
    configState?: string
    matchState?: string
    protectState?: string
    description: string
    vendorID?: string
    equipmentID: string
    totalOnts?: number
    onlineOnts  : string
    slot  : string
    position_ont  : string
    count_ont  ?: number
    expanded: boolean

}