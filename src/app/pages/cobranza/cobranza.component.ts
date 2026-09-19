import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CobranzaConfig, CobranzaService } from '../../services/cobranza.service';

/**
 * Cobranza inteligente: a quién cobrarle, hasta dónde puede negociar el
 * asistente, cuándo escribe y cómo se presenta. Los casos se atienden desde
 * la burbuja del panel.
 */
@Component({
  selector: 'app-cobranza',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cobranza.component.html',
  styleUrl: './cobranza.component.scss',
  host: { class: 'np-console' },
})
export class CobranzaComponent implements OnInit {
  private svc = inject(CobranzaService);

  cfg: CobranzaConfig | null = null;
  iaDisponible = false;
  pasarela = false;
  lineas: Array<{ id: number; nombre: string; telefono: string | null; principal: number }> = [];

  /** La IA: la clave de Google de la empresa (nunca vuelve del servidor), o la de Netvula de prueba. */
  ia = { propia: false, modelos: null as string | null, limite_prueba: 10, usadas_hoy: 0,
    url_clave: 'https://aistudio.google.com/apikey', url_limites: 'https://aistudio.google.com/rate-limit' };
  claveNueva = '';
  verClave = false;
  probando = false;
  resultadoPrueba: { ok: boolean; texto: string } | null = null;

  cargando = true;
  guardando = false;
  revisando = false;
  mensaje = '';
  mensajeTipo: 'ok' | 'error' = 'ok';
  errores: Record<string, string> = {};

  readonly DIAS = [
    { n: 1, t: 'L', largo: 'Lunes' }, { n: 2, t: 'M', largo: 'Martes' }, { n: 3, t: 'X', largo: 'Miércoles' },
    { n: 4, t: 'J', largo: 'Jueves' }, { n: 5, t: 'V', largo: 'Viernes' }, { n: 6, t: 'S', largo: 'Sábado' }, { n: 7, t: 'D', largo: 'Domingo' },
  ];
  diasElegidos = new Set<number>();

  ngOnInit(): void { this.cargar(); }

  cargar(): void {
    this.cargando = true;
    this.svc.config().subscribe({
      next: r => {
        this.cargando = false;
        const d = r?.data ?? {};
        this.cfg = { ...d.config, activa: !!Number(d.config?.activa), compromiso_suspende: !!Number(d.config?.compromiso_suspende), instrucciones: d.config?.instrucciones ?? '' };
        this.iaDisponible = !!d.ia_disponible;
        this.pasarela = !!d.pasarela;
        this.lineas = d.lineas ?? [];
        this.ia = { ...this.ia, ...(d.ia ?? {}) };
        this.claveNueva = '';
        this.diasElegidos = new Set(String(this.cfg?.dias ?? '').split(',').map(Number).filter(Boolean));
      },
      error: () => { this.cargando = false; this.avisar('No se pudo cargar la configuración.', 'error'); },
    });
  }

  alternarDia(n: number): void {
    this.diasElegidos.has(n) ? this.diasElegidos.delete(n) : this.diasElegidos.add(n);
    this.diasElegidos = new Set(this.diasElegidos);
  }

  guardar(): void {
    if (!this.cfg || this.guardando) return;
    this.guardando = true;
    this.errores = {};
    this.cfg.dias = [...this.diasElegidos].sort().join(',');

    const clave = this.claveNueva.trim();

    this.svc.guardarConfig({ ...this.cfg, ...(clave ? { ia_clave: clave } : {}) }).subscribe({
      next: r => {
        this.guardando = false;
        this.avisar(r?.message ?? 'Guardado.', r?.error === 0 ? 'ok' : 'error');
        if (r?.error === 0 && clave) this.cargar();
      },
      error: e => {
        this.guardando = false;
        const errs = e?.error?.errors ?? {};
        this.errores = Object.fromEntries(Object.entries(errs).map(([k, v]: [string, any]) => [k, Array.isArray(v) ? v[0] : String(v)]));
        this.avisar(e?.error?.message && !Object.keys(errs).length ? e.error.message : 'Revisá los campos marcados.', 'error');
      },
    });
  }

  probarClave(): void {
    this.probando = true;
    this.resultadoPrueba = null;
    this.svc.probarIa(this.claveNueva.trim()).subscribe({
      next: r => { this.probando = false; this.resultadoPrueba = { ok: r?.error === 0, texto: r?.message ?? '' }; },
      error: () => { this.probando = false; this.resultadoPrueba = { ok: false, texto: 'No se pudo probar la clave.' }; },
    });
  }

  quitarClave(): void {
    if (!this.cfg || !confirm('¿Quitar la clave de Google de tu empresa? El asistente vuelve a la IA de Netvula, con ' + this.ia.limite_prueba + ' conversaciones de prueba por día.')) return;
    this.svc.guardarConfig({ ...this.cfg, quitar_clave: true }).subscribe({
      next: r => { this.avisar(r?.message ?? 'Listo.', r?.error === 0 ? 'ok' : 'error'); this.cargar(); },
      error: () => this.avisar('No se pudo quitar la clave.', 'error'),
    });
  }

  revisarAhora(): void {
    this.revisando = true;
    this.svc.revisarAhora().subscribe({
      next: r => { this.revisando = false; this.avisar(r?.message ?? 'Listo.', r?.error === 0 ? 'ok' : 'error'); },
      error: () => { this.revisando = false; this.avisar('No se pudo revisar.', 'error'); },
    });
  }

  private avisar(texto: string, tipo: 'ok' | 'error'): void {
    this.mensaje = texto;
    this.mensajeTipo = tipo;
  }

  /** Ejemplo de lo que puede ofrecer, para ver los límites en palabras. */
  get ejemploOferta(): string {
    const c = this.cfg;
    if (!c) return '';
    const partes = [`pagar todo con el link${this.pasarela ? '' : ' (no hay pasarela: no se ofrece)'}`, `un compromiso a más tardar en ${c.plazo_max_dias} día(s)`];
    if (Number(c.cuotas_max) > 1) partes.push(`hasta ${c.cuotas_max} cuotas dentro de ese plazo`);
    if (Number(c.descuento_max_pct) > 0) partes.push(`hasta ${c.descuento_max_pct}% de descuento si paga todo en ${c.descuento_dias} día(s)`);
    return partes.join(', ') + '.';
  }
}
