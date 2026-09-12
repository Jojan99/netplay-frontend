import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OltNavComponent } from '../../shared/olt-nav.component';
import { AcsSetupService } from '../../../../services/acs-setup.service';
import { ToastService } from '../../../../services/toast.service';

/**
 * Asistente del servidor TR-069.
 *
 * Tres pasos y ninguno pide escribir una red a mano: dónde está el servidor,
 * qué redes del router hay que alcanzar —se leen del propio router— y el
 * script para pegar. La plataforma arma el túnel por su cuenta.
 */
@Component({
  selector: 'app-olt-tr069',
  standalone: true,
  imports: [CommonModule, FormsModule, OltNavComponent],
  templateUrl: './olt-tr069.component.html',
  styleUrls: ['../../shared/olt.scss', './olt-tr069.component.scss'],
  host: { class: 'np-console' },
})
export class OltTr069Component implements OnInit {
  private api = inject(AcsSetupService);
  private toast = inject(ToastService);

  estado: any = null;
  redes: any[] = [];
  script: any = null;

  cargando = false;
  detectando = false;
  aplicando = false;
  guardando = false;
  error = '';
  copiado = '';

  form = { modo: 'plataforma', host: '', puerto_cwmp: 7547, url_nbi: '', alcance: 'tunel' };

  ngOnInit() { this.cargar(); }

  cargar() {
    this.cargando = true;
    this.api.estado().subscribe({
      next: (r: any) => {
        this.cargando = false;
        if (r?.error !== 0) { this.error = r?.message || 'No se pudo leer la configuración.'; return; }
        this.aplicarEstado(r.data);
        if (this.estado?.aplicado_en) this.cargarScript();
      },
      error: () => { this.cargando = false; this.error = 'No se pudo leer la configuración.'; },
    });
  }

  private aplicarEstado(d: any) {
    this.estado = d;
    this.redes = d?.redes ?? [];
    this.form = {
      modo: d?.modo ?? 'plataforma',
      host: d?.host ?? '',
      puerto_cwmp: d?.puerto_cwmp ?? 7547,
      url_nbi: d?.url_nbi ?? '',
      alcance: d?.alcance ?? 'tunel',
    };
  }

  cargarScript() {
    this.api.script().subscribe({ next: (r: any) => { if (r?.error === 0) this.script = r.data; } });
  }

  // ── Pasos ─────────────────────────────────────────────────────────────────

  guardarServidor() {
    if (this.form.modo === 'propio' && !this.form.host.trim()) {
      this.toast.error('Falta la dirección de tu servidor TR-069.');
      return;
    }

    this.guardando = true;
    this.api.guardar(this.form).subscribe({
      next: (r: any) => {
        this.guardando = false;
        if (r?.error !== 0) { this.toast.error(r?.message || 'No se pudo guardar.'); return; }
        this.aplicarEstado(r.data);
        this.toast.success('Guardado');
      },
      error: () => { this.guardando = false; this.toast.error('No se pudo guardar.'); },
    });
  }

  detectar() {
    this.detectando = true;
    this.api.detectar().subscribe({
      next: (r: any) => {
        this.detectando = false;
        if (r?.error !== 0) { this.toast.error(r?.message || 'No se pudo leer el router.'); return; }
        this.redes = r.data?.redes ?? [];
        if (r.data?.error) this.toast.error(r.data.error);
        else this.toast.success(`${this.redes.length} redes encontradas en ${r.data?.router ?? 'el router'}`);
      },
      error: () => { this.detectando = false; this.toast.error('No se pudo leer el router.'); },
    });
  }

  aplicar() {
    const elegidas = this.redes.filter(r => r.elegida).map(r => r.red);

    if (!elegidas.length) { this.toast.error('Elegí al menos una red.'); return; }

    this.aplicando = true;
    this.api.aplicar(elegidas).subscribe({
      next: (r: any) => {
        this.aplicando = false;
        if (r?.error !== 0) { this.toast.error(r?.message || 'No se pudo aplicar.'); return; }
        this.aplicarEstado(r.data);
        this.cargarScript();
        this.toast.success('Configuración aplicada');
      },
      error: () => { this.aplicando = false; this.toast.error('No se pudo aplicar.'); },
    });
  }

  // ── Ayudas de pantalla ────────────────────────────────────────────────────

  grupos(): { titulo: string; redes: any[] }[] {
    const titulos: any = {
      clientes: 'Redes de tus clientes',
      pppoe: 'Rangos que reparte el router (PPPoE)',
      olt: 'Gestión de tus OLT',
      gestion: 'Otras redes del router',
    };
    return Object.keys(titulos)
      .map(tipo => ({ titulo: titulos[tipo], redes: this.redes.filter(r => r.tipo === tipo) }))
      .filter(g => g.redes.length);
  }

  get elegidas(): number { return this.redes.filter(r => r.elegida).length; }

  marcarTodas(grupo: any[], valor: boolean) { grupo.forEach(r => r.elegida = valor); }

  async copiar(texto: string, que: string) {
    try {
      await navigator.clipboard.writeText(texto);
      this.copiado = que;
      setTimeout(() => { if (this.copiado === que) this.copiado = ''; }, 1500);
    } catch { }
  }
}
