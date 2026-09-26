import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConsolaAuthService } from '../../../services/consola-auth.service';
import { ToastService } from '../../../services/toast.service';
import { DialogService } from '../../../services/dialog.service';
import { crearPasskey, hayPasskeys, porQueFallo } from '../../../services/webauthn';

/**
 * El authenticator de la cuenta de consola.
 *
 * Esta es la cuenta que administra todas las empresas: con ella se entra a
 * cualquier ISP. Hasta ahora alcanzaba con la contraseña.
 *
 * La activación va en tres momentos a propósito —preparar, confirmar,
 * guardar los códigos— porque el error caro es activarlo con la app mal
 * configurada y quedarse afuera. Por eso no queda exigido hasta que el primer
 * código entra bien, y los de recuperación se muestran antes de terminar.
 */
@Component({
  selector: 'app-consola-seguridad',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './consola-seguridad.component.html',
  styleUrl: './consola-seguridad.component.scss',
})
export class ConsolaSeguridadComponent implements OnInit {
  private sesion = inject(ConsolaAuthService);
  private toast = inject(ToastService);
  private dialog = inject(DialogService);

  cargando = true;
  trabajando = false;

  activo = false;
  activoEn: string | null = null;
  recuperacionQueda = 0;

  /** En qué paso de la activación va: ninguno, el QR, o los códigos. */
  paso: 'nada' | 'escanear' | 'codigos' = 'nada';

  secreto = '';
  direccionQr = '';
  verSecreto = false;
  codigo = '';

  /** Los de recuperación, que se muestran una sola vez. */
  codigos: string[] = [];
  losGuarde = false;

  ngOnInit(): void {
    this.mirar();
    this.avisoDeRecuperacion();
    this.puedePasskey = hayPasskeys();
    this.mirarPasskeys();
  }

  // ── Passkeys ────────────────────────────────────────────────────────────

  /**
   * Las llaves que guarda el navegador o el teléfono.
   *
   * Son mejores que el código de seis dígitos en lo que de verdad importa: no
   * se pueden robar por engaño. Un código se escribe en una página falsa que
   * imite a Netvula; una passkey está atada al dominio y el navegador se
   * niega a usarla en otro sitio.
   */
  puedePasskey = false;
  /** El dominio al que quedan atadas; se muestra para que se entienda el porqué. */
  readonly dominio = typeof window !== 'undefined' ? window.location.hostname : '';
  passkeys: any[] = [];
  agregandoPasskey = false;
  nombrePasskey = '';

  private mirarPasskeys(): void {
    this.sesion.verPasskeys().subscribe({
      next: (r: any) => this.passkeys = r?.data ?? [],
      error: () => { /* si no se pueden leer, la sección queda vacía */ },
    });
  }

  async agregarPasskey(): Promise<void> {
    this.agregandoPasskey = true;

    try {
      const opciones: any = await new Promise((listo, falla) =>
        this.sesion.opcionesDeAltaDePasskey().subscribe({ next: listo, error: falla }));

      const respuesta = await crearPasskey(opciones.data);

      const nombre = this.nombrePasskey.trim() || this.nombreDeEsteEquipo();

      const r: any = await new Promise((listo, falla) =>
        this.sesion.guardarPasskey(respuesta, nombre).subscribe({ next: listo, error: falla }));

      this.agregandoPasskey = false;

      if (r?.error !== 0) { this.toast.error(r?.message || 'No se pudo guardar.'); return; }

      this.passkeys = r.data ?? [];
      this.nombrePasskey = '';
      this.toast.success('Passkey guardada. Ya puede entrar con ella.');
    } catch (e: any) {
      this.agregandoPasskey = false;
      this.toast.error(porQueFallo(e));
    }
  }

  async borrarPasskey(p: any): Promise<void> {
    const ultima = this.passkeys.length === 1;

    if (!await this.dialog.confirm(
      ultima
        ? `Es su única passkey. Si la borra, va a entrar con contraseña${this.activo ? ' y código' : ''}. ¿Seguir?`
        : `¿Eliminar «${p.nombre}»?`,
      { okLabel: 'Sí, eliminar' },
    )) return;

    this.sesion.borrarPasskey(p.id).subscribe({
      next: (r: any) => {
        if (r?.error !== 0) { this.toast.error(r?.message || 'No se pudo.'); return; }
        this.passkeys = r.data ?? [];
        this.toast.success('Passkey eliminada.');
      },
      error: () => this.toast.error('No se pudo eliminar.'),
    });
  }

  /** Un nombre que se entienda en la lista, sacado del navegador. */
  private nombreDeEsteEquipo(): string {
    const ua = navigator.userAgent;
    const sistema = /Windows/i.test(ua) ? 'Windows'
      : /Android/i.test(ua) ? 'Android'
      : /iPhone|iPad/i.test(ua) ? 'iPhone o iPad'
      : /Mac/i.test(ua) ? 'Mac'
      : /Linux/i.test(ua) ? 'Linux' : 'Este equipo';
    const navegador = /Edg\//i.test(ua) ? 'Edge'
      : /Chrome/i.test(ua) ? 'Chrome'
      : /Firefox/i.test(ua) ? 'Firefox'
      : /Safari/i.test(ua) ? 'Safari' : '';

    return navegador ? `${sistema} · ${navegador}` : sistema;
  }

  private mirar(): void {
    this.cargando = true;

    this.sesion.verSegundoFactor().subscribe({
      next: (r: any) => {
        this.cargando = false;
        const d = r?.data ?? {};
        this.activo = !!d.activo;
        this.activoEn = d.activo_en ?? null;
        this.recuperacionQueda = Number(d.recuperacion_queda ?? 0);
      },
      error: () => {
        this.cargando = false;
        this.toast.error('No se pudo leer el estado del authenticator.');
      },
    });
  }

  /**
   * Si entró con un código de recuperación, se le dice cuántos le quedan.
   *
   * Sin códigos y sin teléfono, la única salida es entrar al servidor. Mejor
   * avisar mientras todavía hay margen.
   */
  private avisoDeRecuperacion(): void {
    try {
      const quedan = localStorage.getItem('consola_aviso_recuperacion');
      if (quedan === null) return;

      localStorage.removeItem('consola_aviso_recuperacion');
      this.toast.info(`Entraste con un código de recuperación. Le quedan ${quedan}.`);
    } catch { /* sin almacenamiento no hay aviso, no es grave */ }
  }

  // ── Activar ─────────────────────────────────────────────────────────────

  empezar(): void {
    this.trabajando = true;

    this.sesion.prepararSegundoFactor().subscribe({
      next: (r: any) => {
        this.trabajando = false;
        this.secreto = r?.data?.secreto ?? '';
        this.direccionQr = r?.data?.direccion ?? '';
        this.codigo = '';
        this.paso = 'escanear';
        this.dibujarQr();
      },
      error: () => {
        this.trabajando = false;
        this.toast.error('No se pudo preparar el authenticator.');
      },
    });
  }

  confirmar(): void {
    if (this.codigo.trim().length < 6) {
      this.toast.error('El código son seis dígitos.');
      return;
    }

    this.trabajando = true;

    this.sesion.confirmarSegundoFactor(this.codigo.trim()).subscribe({
      next: (r: any) => {
        this.trabajando = false;

        if (r?.error !== 0) { this.toast.error(r?.message || 'Ese código no es.'); this.codigo = ''; return; }

        this.codigos = r.data?.codigos ?? [];
        this.losGuarde = false;
        this.paso = 'codigos';
        this.secreto = '';
        this.direccionQr = '';
        this.imagenQr = '';
      },
      error: () => {
        this.trabajando = false;
        this.toast.error('No se pudo confirmar.');
      },
    });
  }

  terminar(): void {
    this.paso = 'nada';
    this.codigos = [];
    this.mirar();
    this.toast.success('Authenticator activado.');
  }

  copiarCodigos(): void {
    navigator.clipboard?.writeText(this.codigos.join('\n'));
    this.toast.success('Códigos copiados. Guardalos donde no se pierdan.');
  }

  descargarCodigos(): void {
    const texto = [
      'Códigos de recuperación — Consola de Netvula',
      'Cada uno sirve UNA sola vez. Guardalos fuera de esta computadora.',
      '',
      ...this.codigos,
      '',
      `Generados el ${new Date().toLocaleString('es-CO')}`,
    ].join('\n');

    const url = URL.createObjectURL(new Blob([texto], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'codigos-recuperacion-netvula.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Quitar ──────────────────────────────────────────────────────────────

  clave = '';
  pidiendoClave = false;

  async quitar(): Promise<void> {
    if (!await this.dialog.confirm(
      'Sin el authenticator, su contraseña sola vuelve a abrir la consola de todas las empresas. ¿Seguro?',
      { okLabel: 'Sí, quitarlo', cancelLabel: 'Dejarlo' },
    )) return;

    this.clave = '';
    this.pidiendoClave = true;
  }

  confirmarQuitar(): void {
    if (!this.clave) { this.toast.error('Ingrese su contraseña.'); return; }

    this.trabajando = true;

    this.sesion.quitarSegundoFactor(this.clave).subscribe({
      next: (r: any) => {
        this.trabajando = false;
        this.clave = '';

        if (r?.error !== 0) { this.toast.error(r?.message || 'No se pudo.'); return; }

        this.pidiendoClave = false;
        this.toast.success('Authenticator desactivado.');
        this.mirar();
      },
      error: () => {
        this.trabajando = false;
        this.toast.error('No se pudo desactivar.');
      },
    });
  }

  /**
   * El QR se dibuja aquí, en el navegador.
   *
   * No con un servicio público de códigos QR: eso le mandaría el secreto del
   * authenticator a un tercero, que es exactamente lo que este segundo factor
   * viene a evitar. El secreto no sale de esta pantalla.
   */
  imagenQr = '';

  private async dibujarQr(): Promise<void> {
    this.imagenQr = '';

    if (!this.direccionQr) {
      return;
    }

    try {
      // La librería es CommonJS: según cómo la empaquete el compilador, lo
      // que se busca queda en la raíz o dentro de `default`. Se prueban las
      // dos en vez de dar por hecha una.
      // La entrada de navegador, explícita: «qrcode» a secas resuelve a la
      // versión de Node, que arrastra pngjs y dibuja de otra manera.
      const modulo: any = await import('qrcode/lib/browser');
      const qr = typeof modulo?.toDataURL === 'function' ? modulo : modulo?.default;

      if (typeof qr?.toDataURL !== 'function') {
        throw new Error('la librería de QR no expone toDataURL');
      }

      this.imagenQr = await qr.toDataURL(this.direccionQr, { width: 200, margin: 1 });
    } catch (e) {
      // Que el dibujo falle no puede impedir activar el authenticator: se
      // muestra el código para escribirlo a mano, que es igual de válido.
      this.verSecreto = true;
      console.warn('[2FA] No se pudo dibujar el QR, se muestra el código:', e);
    }
  }
}
