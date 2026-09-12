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
  /** Todas las redes detectadas, de todos los MikroTik de la empresa. */
  redes: any[] = [];
  /** El MikroTik que se está configurando: cada uno lleva su propio túnel. */
  routerSel: number | null = null;
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
    if (!this.routerSel || !(d?.routers ?? []).some((r: any) => r.id === this.routerSel)) {
      this.routerSel = d?.routers?.[0]?.id ?? null;
    }
    this.agrupar();
    this.form = {
      modo: d?.modo ?? 'plataforma',
      host: d?.host ?? '',
      puerto_cwmp: d?.puerto_cwmp ?? 7547,
      url_nbi: d?.url_nbi ?? '',
      alcance: d?.alcance ?? 'tunel',
    };
  }

  cargarScript() {
    this.api.script(this.routerSel).subscribe({ next: (r: any) => { if (r?.error === 0) this.script = r.data; } });
  }

  /** Cambiar de MikroTik: se muestran sus redes y su script. */
  elegirRouter(id: number) {
    this.routerSel = id;
    this.script = null;
    this.agrupar();
    if (this.routerActual?.tunel) this.cargarScript();
  }

  get routerActual(): any {
    return (this.estado?.routers ?? []).find((r: any) => r.id === this.routerSel) ?? null;
  }

  /** Sólo las redes del MikroTik que se está configurando. */
  get redesDelRouter(): any[] {
    return this.redes.filter(r => !this.routerSel || r.router_id === this.routerSel);
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
    this.api.detectar(this.routerSel ?? undefined).subscribe({
      next: (r: any) => {
        this.detectando = false;
        if (r?.error !== 0) { this.toast.error(r?.message || 'No se pudo leer el router.'); return; }
        // Lo detectado es de este router; lo de los otros queda como estaba.
        this.redes = [
          ...this.redes.filter(x => x.router_id !== r.data?.router_id),
          ...(r.data?.redes ?? []),
        ];
        this.agrupar();
        if (r.data?.error) this.toast.error(r.data.error);
        else this.toast.success(`${this.redes.length} redes encontradas en ${r.data?.router ?? 'el router'}`);
      },
      error: () => { this.detectando = false; this.toast.error('No se pudo leer el router.'); },
    });
  }

  aplicar() {
    const elegidas = this.redesDelRouter.filter(r => r.elegida).map(r => r.red);

    if (!elegidas.length) { this.toast.error('Elegí al menos una red.'); return; }

    this.aplicando = true;
    this.api.aplicar(elegidas, this.routerSel).subscribe({
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

  /**
   * Los grupos se arman una vez, al llegar las redes.
   *
   * Calcularlos en la plantilla devolvía un arreglo nuevo en cada ciclo de
   * Angular, así que la vista se rehacía sin parar y la pantalla se trababa.
   */
  grupos: { titulo: string; redes: any[] }[] = [];

  private agrupar() {
    const titulos: Record<string, string> = {
      clientes: 'Redes de tus clientes',
      pppoe: 'Rangos que reparte el router (PPPoE)',
      olt: 'Gestión de tus OLT',
      gestion: 'Otras redes del router',
    };

    const propias = this.redesDelRouter;

    this.grupos = Object.keys(titulos)
      .map(tipo => ({ titulo: titulos[tipo], redes: propias.filter(r => r.tipo === tipo) }))
      .filter(g => g.redes.length);
  }

  get elegidas(): number { return this.redesDelRouter.filter(r => r.elegida).length; }

  marcarTodas(grupo: any[], valor: boolean) { grupo.forEach(r => r.elegida = valor); }

  async copiar(texto: string, que: string) {
    try {
      await navigator.clipboard.writeText(texto);
      this.copiado = que;
      setTimeout(() => { if (this.copiado === que) this.copiado = ''; }, 1500);
    } catch { }
  }
}
