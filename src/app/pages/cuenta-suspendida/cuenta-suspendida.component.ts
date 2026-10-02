import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { DarkThemeToggleComponent } from '../../common/dark-theme-toggle.component';
import { AuthService } from '../../services/auth.service';
import { CuentaService, EstadoDeCuenta } from '../../services/cuenta.service';

/**
 * Lo que ve el equipo de una empresa cuando Netvula le suspendió el acceso:
 * por qué, cuánto debe, a dónde escribir, y que sus clientes no se ven afectados.
 */
@Component({
  selector: 'app-cuenta-suspendida',
  standalone: true,
  imports: [CommonModule, RouterModule, DarkThemeToggleComponent],
  templateUrl: './cuenta-suspendida.component.html',
  styleUrls: ['../sign-in/sign-in/sign-in.component.scss', './cuenta-suspendida.component.scss'],
})
export class CuentaSuspendidaComponent {
  private cuentas = inject(CuentaService);
  private auth = inject(AuthService);
  private router = inject(Router);

  cuenta: EstadoDeCuenta | null = CuentaService.guardada();
  revisando = false;
  sigue = false;

  readonly sitio = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'netvula.com';
  readonly conSesion = typeof localStorage !== 'undefined' && !!localStorage.getItem('token');

  get enlaceWhatsapp(): string | null {
    const wa = this.cuenta?.soporte?.whatsapp;
    if (!wa) return null;
    const texto = `Hola, escribo por la cuenta de ${this.cuenta?.empresa || 'mi empresa'} en Netvula: quiero reactivar el acceso.`;
    return `https://wa.me/${wa}?text=${encodeURIComponent(texto)}`;
  }

  get enlaceCorreo(): string | null {
    const correo = this.cuenta?.soporte?.correo;
    return correo ? `mailto:${correo}?subject=${encodeURIComponent('Reactivar la cuenta de ' + (this.cuenta?.empresa || 'mi empresa'))}` : null;
  }

  /** «Ya lo resolví»: si el servidor deja pasar, la cuenta está activa otra vez. */
  reintentar(): void {
    if (!this.conSesion) { this.router.navigate(['/login']); return; }

    this.revisando = true;
    this.sigue = false;

    this.cuentas.ver().subscribe({
      next: () => {
        CuentaService.olvidar();
        this.router.navigate(['/dashboard/home']);
      },
      error: (err) => {
        this.revisando = false;
        // Un 403 de suspendida refresca lo guardado (lo hace el interceptor); un 401 ya mandó al login.
        this.cuenta = CuentaService.guardada() ?? this.cuenta;
        this.sigue = err?.status === 403;
      },
    });
  }

  salir(): void {
    CuentaService.olvidar();
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
