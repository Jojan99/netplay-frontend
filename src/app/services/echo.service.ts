import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Subject } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class EchoService {

  private echo: any = null;

  public inboxUpdated$ = new Subject<any>();

  /** ¿Llegan los avisos en vivo? La bandeja lo muestra: sin esto un corte no lo notaba nadie. */
  public conectado$ = new BehaviorSubject<boolean>(false);

  /**
   * Volvió la conexión después de un corte: lo que llegó mientras tanto no se avisó, así que
   * la bandeja y el chat abierto se vuelven a pedir.
   */
  public reconectado$ = new Subject<void>();

  constructor(@Inject(PLATFORM_ID) platformId: Object) {
    if (isPlatformBrowser(platformId)) {
      this.initEcho();
    }
  }

  private async initEcho() {
    const Echo = (await import('laravel-echo')).default;
    const Pusher = (await import('pusher-js')).default;

    (window as any).Pusher = Pusher;

    this.echo = new Echo({
      broadcaster: 'pusher',
      key: environment.pusher.key,
      cluster: environment.pusher.cluster,
      forceTLS: true,
      // La clave de la sesión se lee en el momento de autorizar cada canal. Antes se tomaba una
      // sola vez, al arrancar el servicio (antes del login, o con una clave que después se
      // renovaba), y los canales privados fallaban sin decir nada hasta recargar la página.
      authorizer: (channel: any) => ({
        authorize: (socketId: string, callback: (error: any, data: any) => void) => {
          fetch(`${environment.apiUrl}/broadcasting/auth`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ socket_id: socketId, channel_name: channel.name }),
          })
            .then(r => (r.ok ? r.json() : Promise.reject(new Error(`auth ${r.status}`))))
            .then(data => callback(null, data))
            .catch(error => callback(error, null));
        },
      }),
    });

    const conexion = this.echo.connector?.pusher?.connection;
    let huboCorte = false;
    conexion?.bind('state_change', (e: { previous: string; current: string }) => {
      const arriba = e.current === 'connected';
      this.conectado$.next(arriba);
      if (!arriba && e.previous === 'connected') huboCorte = true;
      if (arriba && huboCorte) { huboCorte = false; this.reconectado$.next(); }
    });
    if (conexion?.state === 'connected') this.conectado$.next(true);

    this.escucharBandeja();
  }

  /** El canal de la bandeja que se está escuchando, para no suscribirse dos veces. */
  private canalBandeja: string | null = null;

  /**
   * Escucha la bandeja del CRM de la empresa del usuario.
   *
   * Antes se escuchaba 'crm.inbox', un canal que comparten TODAS las empresas: a
   * cada panel le llegaban los avisos de las demás (el sonido, el contador de no
   * leídos y el id de conversaciones ajenas). Ahora es 'crm.inbox.<empresa>'.
   *
   * Se puede llamar las veces que haga falta: el servicio arranca antes del login
   * y la bandeja se engancha cuando ya se sabe de qué empresa es el usuario.
   */
  escucharBandeja(): void {
    if (!this.echo) return;

    let empresa = 0;
    try { empresa = Number(JSON.parse(localStorage.getItem('auth_user') || 'null')?.company_id) || 0; } catch { empresa = 0; }
    if (!empresa) return;

    const canal = `crm.inbox.${empresa}`;
    if (this.canalBandeja === canal) return;
    if (this.canalBandeja) this.echo.leave(this.canalBandeja);

    this.canalBandeja = canal;
    this.echo.private(canal)
      .listen('.inbox.updated', (e: any) => {
        // Por si acaso: un aviso de otra empresa no se procesa.
        if (e?.companyId && Number(e.companyId) !== empresa) return;
        this.inboxUpdated$.next(e);
      });
  }

  /** 👈 ÚNICA forma correcta de acceder */
  get instance() {
    return this.echo;
  }

  /** 👈 limpieza segura */
  leave(channel: string) {
    if (!this.echo) return;
    this.echo.leave(channel);
  }
}
