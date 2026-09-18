import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ConsolaAuthService } from '../../../services/consola-auth.service';
import { DarkThemeToggleComponent } from '../../../common/dark-theme-toggle.component';

/**
 * El ingreso a la consola de Netvula.
 *
 * Nada del panel de empresas: ni logo de empresa, ni "olvidé mi contraseña",
 * ni registro. Acá entran las pocas personas de Netvula que tienen cuenta,
 * creada a mano con `php artisan consola:usuario`.
 */
@Component({
  selector: 'app-consola-ingresar',
  standalone: true,
  imports: [CommonModule, FormsModule, DarkThemeToggleComponent],
  templateUrl: './consola-ingresar.component.html',
  styleUrl: './consola-ingresar.component.scss',
  host: { class: 'np-console' },
})
export class ConsolaIngresarComponent implements OnInit {
  private sesion = inject(ConsolaAuthService);
  private router = inject(Router);

  email = '';
  password = '';
  verClave = false;
  cargando = false;
  error = '';

  ngOnInit(): void {
    // Si la sesión sigue viva, no hay nada que pedir.
    if (this.sesion.estaDentro()) this.router.navigate(['/consola/tablero']);
  }

  ingresar(): void {
    if (!this.email.trim() || !this.password) {
      this.error = 'Poné tu correo y tu contraseña.';
      return;
    }

    this.cargando = true;
    this.error = '';

    this.sesion.login(this.email.trim(), this.password).subscribe({
      next: r => {
        this.cargando = false;

        if (r?.error || !r?.data?.token) {
          this.error = r?.message || 'No pudimos ingresar.';
          this.password = '';
          return;
        }

        this.router.navigate(['/consola/tablero']);
      },
      error: e => {
        this.cargando = false;
        this.password = '';
        this.error = e?.status === 429
          ? 'Demasiados intentos. Esperá un minuto y probá de nuevo.'
          : (e?.error?.message || 'No pudimos conectarnos. Probá de nuevo.');
      },
    });
  }
}
