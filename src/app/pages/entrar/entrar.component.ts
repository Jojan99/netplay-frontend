import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CompanyService } from '../../services/company.service';
import { AuthService } from '../../services/auth.service';

/**
 * Llegada al subdominio de la empresa después de iniciar sesión en la raíz.
 *
 * El navegador guarda la sesión por dominio: la que se abrió en netvula.com
 * no sirve en netplay.netvula.com. El login de la raíz manda aquí con un vale
 * de un solo uso que dura dos minutos, y aquí se canjea por la sesión.
 */
@Component({
  selector: 'app-entrar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  styleUrl: '../sign-in/sign-in/sign-in.component.scss',
  template: `
    <div class="np-console np-login np-entrar">
      <main class="np-login-main">
        <div class="np-login-card">
          <p class="np-kicker">Acceso <b>/</b> Empresa</p>
          @if (fallo()) {
            <h1 class="np-title np-login-title">El enlace ya no sirve</h1>
            <p class="np-login-help">Se usa una sola vez y vence a los dos minutos. Inicie sesión de nuevo desde esta dirección.</p>
            <a class="np-btn np-btn--primary np-login-submit" routerLink="/login">Iniciar sesión</a>
          } @else {
            <h1 class="np-title np-login-title">Entrando…</h1>
            <p class="np-login-help"><span class="np-spinner np-spinner--sm"></span> Abriendo su sesión en la dirección de su empresa.</p>
          }
        </div>
      </main>
    </div>
  `,
  styles: [`.np-entrar { grid-template-columns: minmax(0, 1fr) !important; }`],
})
export class EntrarComponent implements OnInit {
  private route   = inject(ActivatedRoute);
  private router  = inject(Router);
  private company = inject(CompanyService);
  private auth    = inject(AuthService);

  fallo = signal(false);

  ngOnInit(): void {
    const vale = this.route.snapshot.queryParamMap.get('vale') ?? '';

    // El vale no queda en el historial ni se reenvía si se recarga.
    if (typeof window !== 'undefined') window.history.replaceState(null, '', '/entrar');

    if (!vale) { this.fallo.set(true); return; }

    this.company.confirmSession(vale).subscribe({
      next: (res) => {
        if (res?.error || !res?.data?.access_token) { this.fallo.set(true); return; }
        this.auth.login(res.data);
        this.auth.setModules(res.data.modules ?? []);
        this.router.navigate(['/dashboard/home'], { replaceUrl: true });
      },
      error: () => this.fallo.set(true),
    });
  }
}
