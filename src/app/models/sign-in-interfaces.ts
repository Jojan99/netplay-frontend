export interface SignInInterface {
  
    user: string
    password: string
    /** Mantener la sesión abierta: el token dura 30 días. */
    recordar?: boolean

}