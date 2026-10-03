import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ClientApiService }  from '../services/client-api.service';
import { ClientAuthService } from '../services/client-auth.service';

/**
 * Entrada al portal desde el enlace de pago de WhatsApp («Administrar mi WiFi»).
 *
 * El cliente no tiene que recordar usuario ni contraseña: el enlace ya dice quién es y sólo
 * se le piden los últimos cuatro dígitos de la cédula del titular, por si el enlace llegó a
 * otras manos. La sesión dura una hora y lo deja directo en «Mi WiFi».
 */
@Component({
  selector: 'app-portal-entrar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="pt-app pt-login">
      <main class="pt-login-main" style="flex:1">
        <form class="pt-login-card" (ngSubmit)="entrar()" autocomplete="off">
          <div class="pt-login-title"><h1>Mi WiFi y mi servicio</h1>
            <p>Para proteger su red, escriba los <b>últimos 4 dígitos</b> de la cédula del titular del servicio.</p></div>

          <div class="pt-alert pt-alert--danger" *ngIf="!token" role="alert"><span>El enlace está incompleto. Ábralo de nuevo desde el mensaje de WhatsApp.</span></div>
          <div class="pt-alert pt-alert--danger" *ngIf="errorMsg()" role="alert"><span>{{ errorMsg() }}</span></div>

          <label class="pt-field"><span>Últimos 4 dígitos de la cédula</span>
            <input class="pt-input np-mono" type="text" inputmode="numeric" name="documento" [(ngModel)]="documento"
                   maxlength="4" placeholder="••••" autofocus style="letter-spacing:.4em;font-size:22px;text-align:center" /></label>

          <button type="submit" class="pt-btn pt-btn--primary pt-btn--block" [disabled]="loading() || !token || documento.length < 4">
            <span class="pt-spinner" *ngIf="loading()"></span>{{ loading() ? 'Verificando…' : 'Entrar' }}</button>

          <div class="pt-login-foot"><span>¿Tiene usuario y contraseña?</span><a routerLink="/portal/login">Ingresar normal</a></div>
        </form>
      </main>
    </div>
  `,
})
export class PortalEntrarComponent implements OnInit {
  private api    = inject(ClientApiService);
  private auth   = inject(ClientAuthService);
  private router = inject(Router);
  private route  = inject(ActivatedRoute);

  token = '';
  documento = '';
  loading  = signal(false);
  errorMsg = signal('');

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('t') ?? '';
  }

  entrar(): void {
    this.errorMsg.set('');
    this.loading.set(true);
    this.api.entrarConEnlace(this.token, this.documento.replace(/\D/g, '')).subscribe({
      next: (res: any) => {
        this.loading.set(false);
        if (!res?.data?.access_token) { this.errorMsg.set(res?.message || 'No se pudo entrar.'); return; }
        this.auth.save(res.data);
        this.router.navigateByUrl('/portal/mi-wifi');
      },
      error: (e) => { this.loading.set(false); this.errorMsg.set(e?.error?.message || 'No se pudo entrar. Intente de nuevo.'); },
    });
  }
}
