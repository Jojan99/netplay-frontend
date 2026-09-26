import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ClientApiService }  from '../services/client-api.service';
import { ClientAuthService } from '../services/client-auth.service';
import { SitioService, Sitio } from '../../services/sitio.service';

@Component({
  selector: 'app-client-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './client-login.component.html',
  styles: [`
    .pt-login-brand img { width: 52px; height: 52px; object-fit: contain; background: #fff; border: 1px solid var(--line); padding: 3px; border-radius: var(--radius-lg); }
    .pt-login-brand .pt-brand-mono { width: 52px; height: 52px; border-radius: var(--radius-lg); display: grid; place-items: center; flex-shrink: 0; background: var(--accent); color: var(--accent-ink); font: 700 20px var(--font-display); }
    .pt-login-brand b { font-size: 18px; line-height: 1.15; }
  `],
})
export class ClientLoginComponent implements OnInit {
  private api    = inject(ClientApiService);
  private auth   = inject(ClientAuthService);
  private router = inject(Router);
  private route  = inject(ActivatedRoute);
  private sitio  = inject(SitioService);

  username  = '';
  password  = '';
  /** Mantener la sesión abierta: el token dura 30 días. */
  recordar  = true;
  loading   = signal(false);
  showPw    = false;
  errorMsg  = signal('');

  /** La empresa de esta dirección: su nombre y su logo le dan confianza al cliente. */
  info     = signal<Sitio | null>(null);
  logoRoto = signal(false);
  /** Cliente de varias empresas con el mismo documento: elige cuál consultar. */
  elegir   = signal<{ nombre: string; subdominio: string }[]>([]);
  private empresa = '';

  empresaNombre = computed(() => this.info()?.tipo === 'empresa' ? (this.info()?.empresa?.nombre ?? '') : '');
  empresaLogo   = computed(() => this.logoRoto() ? '' : (this.info()?.empresa?.logo ?? ''));
  desconocida   = computed(() => this.info()?.tipo === 'desconocida');
  inicial       = computed(() => (this.empresaNombre() || 'P').charAt(0).toUpperCase());

  ngOnInit(): void {
    this.empresa = this.route.snapshot.queryParamMap.get('empresa') ?? '';
    this.sitio.cargar(this.empresa).subscribe(s => this.info.set(s));
  }

  login(): void {
    if (!this.username || !this.password) {
      this.errorMsg.set('Ingresa su usuario y contraseña');
      return;
    }
    this.loading.set(true);
    this.errorMsg.set('');
    this.elegir.set([]);

    this.api.login(this.username, this.password, this.recordar, this.empresa).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.data?.access_token) {
          this.auth.save(res.data);
          this.router.navigate(['/portal/home']);
        } else if (Array.isArray(res.data?.elegir_empresa) && res.data.elegir_empresa.length) {
          this.elegir.set(res.data.elegir_empresa);
        } else {
          this.errorMsg.set(res.message ?? 'Credenciales incorrectas');
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMsg.set(err?.error?.message || 'Error de conexión. Intenta de nuevo.');
      },
    });
  }

  elegirEmpresa(subdominio: string): void {
    this.empresa = subdominio;
    this.login();
  }
}
