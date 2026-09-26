import { Component, ElementRef, OnInit, inject, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ConsolaAuthService } from '../../../services/consola-auth.service';
import { DarkThemeToggleComponent } from '../../../common/dark-theme-toggle.component';
import { hayAlgunaGuardada, hayPasskeys, porQueFallo, usarPasskey } from '../../../services/webauthn';

/**
 * El ingreso a la consola de Netvula.
 *
 * Nada del panel de empresas: ni logo de empresa, ni "olvidé mi contraseña",
 * ni registro. Aquí entran las pocas personas de Netvula que tienen cuenta,
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
  campoCodigo = viewChild<ElementRef<HTMLInputElement>>('campoCodigo');
  private router = inject(Router);

  email = '';
  password = '';
  verClave = false;
  cargando = false;
  error = '';

  /**
   * El pase que devuelve la contraseña cuando hay authenticator.
   *
   * Mientras esté, la pantalla muestra el paso del código: la contraseña ya
   * fue, lo que falta son los seis dígitos.
   */
  pase = '';
  codigo = '';

  /**
   * Si este navegador puede usar passkeys.
   *
   * El botón no se muestra donde no va a funcionar: uno que siempre falla es
   * peor que no tenerlo.
   */
  puedePasskey = false;
  conPasskey = false;

  ngOnInit(): void {
    // Si la sesión sigue viva, no hay nada que pedir.
    if (this.sesion.estaDentro()) { this.router.navigate(['/consola/tablero']); return; }

    if (hayPasskeys()) hayAlgunaGuardada().then(puede => this.puedePasskey = puede);
  }

  /**
   * Entrar con la huella, la cara o el PIN del dispositivo.
   *
   * No pide correo: la passkey ya sabe de quién es. Y no se puede usar en una
   * página que imite a Netvula, porque está atada a este dominio — que es lo
   * que la hace mejor que un código escrito a mano.
   */
  async entrarConPasskey(): Promise<void> {
    this.error = '';
    this.conPasskey = true;

    try {
      const desafio: any = await new Promise((listo, falla) =>
        this.sesion.opcionesDePasskey().subscribe({ next: listo, error: falla }));

      const respuesta = await usarPasskey(desafio.data.opciones);

      const r: any = await new Promise((listo, falla) =>
        this.sesion.loginConPasskey(desafio.data.pase, respuesta).subscribe({ next: listo, error: falla }));

      this.conPasskey = false;

      if (r?.error || !r?.data?.token) {
        this.error = r?.message || 'No se pudo entrar con la passkey.';
        return;
      }

      this.router.navigate(['/consola/tablero']);
    } catch (e: any) {
      this.conPasskey = false;
      this.error = porQueFallo(e);
    }
  }

  ingresar(): void {
    if (!this.email.trim() || !this.password) {
      this.error = 'Ingrese su correo y su contraseña.';
      return;
    }

    this.cargando = true;
    this.error = '';

    this.sesion.login(this.email.trim(), this.password).subscribe({
      next: r => {
        this.cargando = false;

        // La contraseña estuvo bien pero falta el código del authenticator.
        if (r?.data?.falta_codigo) {
          this.pase = r.data.pase;
          this.password = '';
          setTimeout(() => this.campoCodigo()?.nativeElement.focus(), 50);
          return;
        }

        if (r?.error || !r?.data?.token) {
          this.error = r?.message || 'No pudimos ingresar.';
          this.password = '';
          return;
        }

        this.router.navigate(['/consola/tablero']);
      },
      error: e => this.falloDeRed(e),
    });
  }

  /** El segundo paso: el código de seis dígitos, o uno de recuperación. */
  comprobarCodigo(): void {
    const codigo = this.codigo.trim();

    if (!codigo) {
      this.error = 'Ingrese el código de su authenticator.';
      return;
    }

    this.cargando = true;
    this.error = '';

    this.sesion.loginConCodigo(this.pase, codigo).subscribe({
      next: r => {
        this.cargando = false;

        if (r?.error || !r?.data?.token) {
          this.error = r?.message || 'Ese código no es.';
          this.codigo = '';

          // El pase se cerró (demasiados intentos o venció): vuelve al
          // principio, porque insistir con el código ya no sirve de nada.
          if (/venci|intentos/i.test(String(r?.message ?? ''))) this.volverAlPrincipio();
          return;
        }

        // Entró con un código de recuperación: le quedan menos, y si se
        // queda sin ninguno pierde la forma de entrar sin el teléfono.
        if (r.data.uso_recuperacion) {
          try {
            localStorage.setItem('consola_aviso_recuperacion', String(r.data.recuperacion_queda ?? 0));
          } catch { /* sin almacenamiento el aviso se pierde, no es grave */ }
        }

        this.router.navigate(['/consola/tablero']);
      },
      error: e => this.falloDeRed(e),
    });
  }

  volverAlPrincipio(): void {
    this.pase = '';
    this.codigo = '';
    this.password = '';
  }

  /** Sólo dígitos: el campo del código no acepta otra cosa. */
  soloDigitos(): void {
    this.codigo = this.codigo.replace(/[^0-9A-Za-z-]/g, '').toUpperCase();
  }

  private falloDeRed(e: any): void {
    this.cargando = false;
    this.password = '';
    this.error = e?.status === 429
      ? 'Demasiados intentos. Espere un minuto y pruebe de nuevo.'
      : (e?.error?.message || 'No pudimos conectarnos. Pruebe de nuevo.');
  }
}
