import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subject } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class EchoService {

  private echo: any = null;

  public inboxUpdated$ = new Subject<any>();

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
      authEndpoint: `${environment.apiUrl}/broadcasting/auth`,
      auth: {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          Accept: 'application/json'
        }
      }
    });

    // 🔵 LISTENER GLOBAL DEL INBOX
    this.echo.private('crm.inbox')
      .listen('.inbox.updated', (e: any) => {
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
