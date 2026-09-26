import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import { OauthService } from '../../../services/oauth.service';
import { AuthService } from '../../../services/auth.service';
import { CompanyService } from '../../../services/company.service';
import { LocationTrackerService } from '../../../services/location-tracker.service';
import { SitioService, Sitio } from '../../../services/sitio.service';
import { SignInInterface } from '../../../models/sign-in-interfaces';
import { DarkThemeToggleComponent } from '../../../common/dark-theme-toggle.component';

@Component({
  selector: 'app-sign-in',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, DarkThemeToggleComponent],
  templateUrl: './sign-in.component.html',
  styleUrl: './sign-in.component.scss',
  styles: [`
    .np-login-empresa { display: flex; align-items: center; gap: 12px; padding-bottom: 14px; margin-bottom: 2px; border-bottom: 1px solid var(--line); }
    .np-login-empresa img { width: 52px; height: 52px; border-radius: var(--radius-lg); object-fit: contain; background: #fff; border: 1px solid var(--line); padding: 3px; }
    .np-login-empresa-ini { width: 52px; height: 52px; border-radius: var(--radius-lg); display: grid; place-items: center; flex-shrink: 0; background: var(--accent); color: var(--accent-ink); font: 700 20px var(--font-display); }
    .np-login-empresa b { display: block; font: 600 18px/1.15 var(--font-display); letter-spacing: -0.01em; }
    .np-login-empresa small { display: block; margin-top: 2px; font: 10.5px var(--font-mono); text-transform: uppercase; letter-spacing: .05em; color: var(--text-3); }
  `],
})
export class SignInComponent implements OnInit {
  /** El dominio desde el que se abre (netvula.com o netplay.netvula.com). */
  readonly sitio = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'netvula.com';
  isLoading = false;
  Islogin   = false;
  errorMsg  = '';
  needsConfirmation = false;   // la empresa existe pero falta activar el correo
  resendMsg = '';
  resending = false;

  /** La empresa de esta dirección, para mostrar su nombre y su logo. */
  info: Sitio | null = null;
  logoRoto = false;
  /** El mismo usuario en varias empresas: se elige a cuál entrar. */
  empresasParaElegir: { nombre: string; subdominio: string }[] = [];
  /** ?empresa=netplay en la raíz, o la elegida de la lista. */
  private empresa = '';

  public SignInInterfaces: SignInInterface = { user: '', password: '', recordar: true };

  private sitioService = inject(SitioService);
  private route        = inject(ActivatedRoute);

  constructor(
    private OauthService:       OauthService,
    private authService:        AuthService,
    private companyService:     CompanyService,
    private locationTracker:    LocationTrackerService,
    private router:             Router,
  ) {}

  get enEmpresa(): boolean { return this.info?.tipo === 'empresa' && !!this.info.empresa; }
  get desconocida(): boolean { return this.info?.tipo === 'desconocida'; }
  get empresaNombre(): string { return this.info?.empresa?.nombre ?? ''; }
  get empresaLogo(): string { return this.logoRoto ? '' : (this.info?.empresa?.logo ?? ''); }
  get marca(): string { return this.info?.plataforma?.nombre || 'Netvula'; }
  get raiz(): string { return this.sitioService.raiz(this.info); }
  get iniciales(): string {
    return this.empresaNombre.split(/\s+/).filter(p => p.length > 2 || /^[A-Z0-9]/.test(p)).slice(0, 2).map(p => p[0]).join('').toUpperCase() || 'E';
  }

  ngOnInit(): void {
    this.empresa = this.route.snapshot.queryParamMap.get('empresa') ?? '';
    this.sitioService.cargar(this.empresa).subscribe(s => this.info = s);
  }

  signin(): void {
    this.isLoading = true;
    this.Islogin   = false;
    this.empresasParaElegir = [];

    this.OauthService.signin({ ...this.SignInInterfaces, empresa: this.empresa }).subscribe({
      next: (res) => {
        // Entró desde la raíz: la sesión se abre en el subdominio de su empresa.
        if (!res.error && res.data?.ir_a) {
          window.location.href = res.data.ir_a;
          return;
        }

        this.isLoading = false;
        if (!res.error && res.data?.access_token) {
          this.authService.login(res.data);
          this.locationTracker.startTrackingIfTechnician();
          this.companyService.getMyModules().subscribe({
            next: (mod) => {
              this.authService.setModules(mod.data ?? []);
              this.router.navigate(['/dashboard/home']);
            },
            error: () => this.router.navigate(['/dashboard/home']),
          });
        } else if (Array.isArray(res.data?.elegir_empresa) && res.data.elegir_empresa.length) {
          this.empresasParaElegir = res.data.elegir_empresa;
        } else {
          this.Islogin = true;
          this.needsConfirmation = !!res.data?.needs_confirmation;
          this.errorMsg = res.message || 'Documento o contraseña incorrectos.';
        }
      },
      error: () => {
        this.isLoading = false;
        this.Islogin   = true;
        this.needsConfirmation = false;
        this.errorMsg = 'No pudimos conectar. Revise su internet e intente de nuevo.';
      },
    });
  }

  /** Vuelve a intentar el ingreso en la empresa elegida. */
  elegirEmpresa(subdominio: string): void {
    this.empresa = subdominio;
    this.signin();
  }

  /** Vuelve a mandar el correo de activación cuando la cuenta quedó sin confirmar. */
  resendConfirmation(): void {
    if (this.resending || !this.SignInInterfaces.user) return;
    this.resending = true;
    this.resendMsg = '';
    this.companyService.resendConfirmation(this.SignInInterfaces.user).subscribe({
      next: (r: any) => { this.resending = false; this.resendMsg = r?.message || 'Le reenviamos el correo de activación.'; },
      error: () => { this.resending = false; this.resendMsg = 'No pudimos reenviar el correo. Escribinos para activarte la cuenta.'; },
    });
  }
}
