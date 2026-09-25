import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConsolaAuthService } from '../../../services/consola-auth.service';
import { ToastService } from '../../../services/toast.service';
import { DialogService } from '../../../services/dialog.service';

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
      this.toast.info(`Entraste con un código de recuperación. Te quedan ${quedan}.`);
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
      'Sin el authenticator, tu contraseña sola vuelve a abrir la consola de todas las empresas. ¿Seguro?',
      { okLabel: 'Sí, quitarlo', cancelLabel: 'Dejarlo' },
    )) return;

    this.clave = '';
    this.pidiendoClave = true;
  }

  confirmarQuitar(): void {
    if (!this.clave) { this.toast.error('Poné tu contraseña.'); return; }

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
   * El QR se dibuja acá, en el navegador.
   *
   * No con un servicio público de códigos QR: eso le mandaría el secreto del
   * authenticator a un tercero, que es exactamente lo que este segundo factor
   * viene a evitar. El secreto no sale de esta pantalla.
   */
  imagenQr = '';

  private async dibujarQr(): Promise<void> {
    if (!this.direccionQr) { this.imagenQr = ''; return; }

    try {
      const QRCode = await import('qrcode');
      this.imagenQr = await QRCode.toDataURL(this.direccionQr, { width: 200, margin: 1 });
    } catch {
      // Sin QR todavía se puede activar escribiendo el secreto a mano.
      this.imagenQr = '';
    }
  }
}
