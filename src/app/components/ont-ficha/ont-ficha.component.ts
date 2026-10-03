import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OltService } from '../../services/olt.service';
import { AcsService } from '../../services/acs.service';
import { GestionRemotaService } from '../../services/gestion-remota.service';
import { TareasEnSegundoPlanoService } from '../../services/tareas-en-segundo-plano.service';
import { DialogService } from '../../services/dialog.service';
import { ToastService } from '../../services/toast.service';
import { OntVinculada } from '../ont-equipo/ont-equipo.component';

type Tono = 'ok' | 'warn' | 'danger' | 'info';

/** Una cifra del tablero: valor, y si hay algo que mirar. */
interface Dato { etiqueta: string; valor: string; nota?: string; tono?: Tono; }

interface Parametro { ruta: string; corta: string; valor: string | null; leido_en: string | null; oculto: boolean; }

/**
 * La ficha completa del equipo del cliente, en una sola ventana.
 *
 * Junta lo que dicen dos fuentes que hasta ahora había que mirar por separado:
 *
 *   la OLT      → si está en línea, la señal, el voltaje, la temperatura y por qué y cuándo
 *                 se cayó la última vez (sin energía, sin fibra o un reinicio);
 *   el TR-069   → cuándo arrancó, su red, su WiFi, los aparatos conectados y todo lo demás
 *                 que el equipo publica.
 *
 * Con eso arma arriba una frase que el operador le puede decir al cliente tal cual: «está
 * apagado porque se quedó sin energía, no es la red» es otra llamada que «perdió la fibra».
 */
@Component({
  selector: 'app-ont-ficha',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ont-ficha.component.html',
  styleUrl: './ont-ficha.component.scss',
})
export class OntFichaComponent implements OnInit, OnDestroy {
  private olt = inject(OltService);
  private acsSvc = inject(AcsService);
  private gestion = inject(GestionRemotaService);
  private tareas = inject(TareasEnSegundoPlanoService);
  private dialog = inject(DialogService);
  private toast = inject(ToastService);

  @Input({ required: true }) userId!: number;
  @Input() ont: OntVinculada | null = null;
  @Input() cliente = '';
  @Output() cerrar = new EventEmitter<void>();

  vivo: any = null;
  equipo: any = null;
  acs: any = null;

  cargandoOlt = false;
  cargandoAcs = false;
  reiniciando = false;

  // ── Lo que se pinta (campos, no getters: se calculan al llegar cada dato) ──
  marca = '';
  modelo = '';
  enLinea: boolean | null = null;
  veredicto: { tono: Tono; titulo: string; detalle: string } = { tono: 'info', titulo: 'Consultando el equipo…', detalle: '' };
  energia: Dato[] = [];
  senal: Dato[] = [];
  redes: any[] = [];
  wifi: any[] = [];
  aparatos: any[] = [];
  aparatosActivos = 0;

  // ── Todos los datos del TR-069 ──
  verTodo = false;
  cargandoParametros = false;
  parametros: Parametro[] = [];
  visibles: Parametro[] = [];
  filtro = '';

  private vivo$: any;
  private vivoTimer: any;

  ngOnInit(): void { this.cargar(true); }

  ngOnDestroy(): void { clearTimeout(this.vivoTimer); }

  // ── Carga ─────────────────────────────────────────────────────────────────

  cargar(fresco = false): void {
    const id = this.userId;
    this.cargandoOlt = true;
    this.cargandoAcs = true;

    // Siempre fresco contra la OLT: la causa y la hora de la última caída sólo vienen en la
    // lectura directa de la ONT, no en el barrido de toda la OLT que se guarda en caché.
    this.olt.ontEnVivo(id, true).subscribe({
      next: r => { if (id !== this.userId) return; this.cargandoOlt = false; this.vivo = r?.data?.vivo ?? { error: r?.message || 'La OLT no respondió.' }; this.armar(); },
      error: () => { this.cargandoOlt = false; this.vivo = { error: 'La OLT no respondió.' }; this.armar(); },
    });

    this.olt.equipoDeCliente(id).subscribe({
      next: r => { if (id !== this.userId) return; this.equipo = r?.data ?? null; this.armar(); },
      error: () => {},
    });

    this.acsSvc.deCliente(id).subscribe({
      next: (r: any) => { if (id !== this.userId) return; this.cargandoAcs = false; this.acs = r?.error === 0 ? r.data : null; this.armar(); },
      error: () => { this.cargandoAcs = false; this.acs = null; this.armar(); },
    });

    if (this.verTodo) this.cargarParametros();
  }

  // ── Interpretación ────────────────────────────────────────────────────────

  private armar(): void {
    const v = this.vivo && !this.vivo.error ? this.vivo : null;
    const a = this.acs;
    const version = this.equipo?.version ?? null;

    this.marca = version?.fabricante || a?.fabricante || v?.fabricante || '';
    this.modelo = version?.modelo || a?.modelo || v?.modelo || '';
    this.enLinea = v ? v.status === 'online' : (this.ont?.estado ? this.ont.estado === 'online' : null);

    this.veredicto = this.juzgar(v, a);
    this.energia = this.datosDeEnergia(v, a);
    this.senal = this.datosDeSenal(v, a);

    this.redes = (a?.wan ?? []).map((w: any) => ({ ...w, conectada: /connected/i.test(w.estado ?? '') && !/dis|un/i.test(w.estado ?? '') }));
    this.wifi = (a?.wifi ?? []).filter((r: any) => r.ssid);
    this.aparatos = a?.equipos ?? [];
    this.aparatosActivos = this.aparatos.filter((e: any) => e.activo).length;
  }

  /** La frase de arriba: qué le pasa al equipo, en palabras para el cliente. */
  private juzgar(v: any, a: any): { tono: Tono; titulo: string; detalle: string } {
    if (!v && (this.cargandoOlt || !this.vivo)) {
      return { tono: 'info', titulo: 'Consultando el equipo…', detalle: 'Preguntándole a la OLT cómo está ahora.' };
    }
    if (!v) {
      return { tono: 'warn', titulo: 'No se pudo consultar la OLT', detalle: this.vivo?.error ?? '' };
    }

    const cuando = v.ultima_caida ? ' (' + this.fecha(v.ultima_caida) + ')' : '';

    if (v.status !== 'online') {
      if (v.causa_caida === 'energia') {
        return { tono: 'danger', titulo: 'Apagado: se quedó sin energía', detalle: `El equipo avisó que se quedaba sin corriente${cuando}. No es la red: que el cliente revise que esté enchufado y que haya luz.` };
      }
      if (v.causa_caida === 'fibra') {
        return { tono: 'danger', titulo: 'Sin señal de fibra', detalle: `Perdió la señal óptica${cuando}. Revise el cable de fibra en la casa (doblado o suelto); si está bien, puede ser un corte en la calle.` };
      }
      if (v.causa_caida === 'desactivada') {
        return { tono: 'warn', titulo: 'Desactivado desde la OLT', detalle: `La OLT lo tiene desactivado${cuando}.` };
      }
      return { tono: 'danger', titulo: 'Fuera de línea', detalle: `La OLT dejó de verlo${cuando}. ${v.causa_texto ?? 'No informó la causa.'}` };
    }

    const hace = a?.encendido_hace ? this.duracion(a.encendido_hace) : (v.ultima_subida ? this.hace(v.ultima_subida) : '');
    const malas = ['critica', 'baja', 'saturada'].includes(v.estado);

    if (malas) {
      return { tono: 'warn', titulo: 'En línea, con la señal ' + ({ critica: 'crítica', baja: 'baja', saturada: 'saturada' } as any)[v.estado], detalle: `Recibe ${this.num(v.potencia, 2)} dBm. Puede navegar con cortes: conviene revisar la fibra.` };
    }

    return { tono: 'ok', titulo: 'En línea', detalle: hace ? `Encendido hace ${hace}.` : 'El equipo responde con normalidad.' };
  }

  private datosDeEnergia(v: any, a: any): Dato[] {
    const d: Dato[] = [];
    const arranque = a?.ultimo_arranque ?? v?.ultima_subida ?? null;

    d.push({
      etiqueta: 'Último arranque',
      valor: arranque ? this.fecha(arranque) : '—',
      nota: a?.encendido_hace ? 'Encendido hace ' + this.duracion(a.encendido_hace) : (arranque ? 'Hace ' + this.hace(arranque) : 'Sin dato'),
    });

    if (v) {
      const fuera = v.ultima_caida && v.ultima_subida ? (Date.parse(v.ultima_subida) - Date.parse(v.ultima_caida)) / 1000 : null;

      d.push({
        etiqueta: 'Última caída',
        valor: v.ultima_caida ? this.fecha(v.ultima_caida) : 'Sin registro',
        nota: fuera !== null && fuera >= 0 ? 'Estuvo ' + this.duracion(fuera) + ' fuera' : (v.status !== 'online' && v.ultima_caida ? 'Sigue caído' : undefined),
      });

      d.push({
        etiqueta: 'Motivo de la última caída',
        valor: ({ energia: 'Corte de energía', fibra: 'Pérdida de fibra', reinicio: 'Reinicio', desactivada: 'Desactivado' } as any)[v.causa_caida] ?? 'No informado',
        nota: v.causa_texto ?? undefined,
        tono: v.causa_caida === 'energia' || v.causa_caida === 'fibra' ? 'warn' : undefined,
      });

      if (v.voltaje !== null && v.voltaje !== undefined) {
        const bajo = v.voltaje < 3.1, alto = v.voltaje > 3.6;
        d.push({
          etiqueta: 'Voltaje',
          valor: this.num(v.voltaje, 2) + ' V',
          nota: bajo ? 'Bajo: fuente débil o regleta en mal estado' : alto ? 'Alto: revise la fuente' : 'Normal (3,1 a 3,6 V)',
          tono: bajo || alto ? 'danger' : 'ok',
        });
      }

      if (v.temperatura !== null && v.temperatura !== undefined) {
        const caliente = v.temperatura >= 70;
        d.push({ etiqueta: 'Temperatura', valor: this.num(v.temperatura, 0) + ' °C', nota: caliente ? 'Alta: equipo encerrado o al sol' : 'Normal', tono: caliente ? 'warn' : 'ok' });
      }

      if (v.corriente !== null && v.corriente !== undefined) {
        d.push({ etiqueta: 'Corriente del láser', valor: this.num(v.corriente, 1) + ' mA' });
      }
    }

    return d;
  }

  private datosDeSenal(v: any, a: any): Dato[] {
    if (!v) return [];

    const d: Dato[] = [];
    const nombre = ({ buena: 'Buena', regular: 'Regular', baja: 'Baja', critica: 'Crítica', saturada: 'Saturada', sin_senal: 'Sin señal' } as any)[v.estado] ?? 'Sin dato';
    const tono: Tono = v.estado === 'buena' ? 'ok' : v.estado === 'regular' ? 'info' : v.estado === 'sin_dato' ? 'info' : 'danger';

    d.push({ etiqueta: 'Recibe el equipo', valor: v.potencia !== null && v.potencia !== undefined ? this.num(v.potencia, 2) + ' dBm' : '—', nota: nombre, tono });

    const tx = v.tx ?? a?.optica?.tx ?? null;
    if (tx !== null) d.push({ etiqueta: 'Transmite el equipo', valor: this.num(tx, 2) + ' dBm' });
    if (v.olt_rx !== null && v.olt_rx !== undefined) d.push({ etiqueta: 'Recibe la OLT', valor: this.num(v.olt_rx, 2) + ' dBm' });
    if (v.distancia_m !== null && v.distancia_m !== undefined) d.push({ etiqueta: 'Distancia a la OLT', valor: this.num(v.distancia_m, 0) + ' m' });

    return d;
  }

  // ── Acciones ──────────────────────────────────────────────────────────────

  async reiniciar(): Promise<void> {
    if (this.reiniciando) return;

    const porAcs = !!this.acs?.id;
    if (!porAcs && !this.ont?.olt_id) { this.toast.warning('Este equipo no se puede reiniciar desde aquí: no reporta al TR-069 y no se conoce su OLT.'); return; }

    const ok = await this.dialog.confirm(`¿Reiniciar el equipo de ${this.cliente || 'este cliente'}? Se queda sin internet alrededor de un minuto.`, { title: 'Reiniciar equipo', okLabel: 'Sí, reiniciar', cancelLabel: 'Cancelar', danger: true });
    if (!ok) return;

    this.reiniciando = true;
    const fin = (texto: string, bien: boolean) => {
      this.reiniciando = false;
      bien ? this.toast.success(texto) : this.toast.error(texto);
      // Al volver, la OLT ya tiene la caída nueva: se vuelve a leer.
      if (bien) { clearTimeout(this.vivoTimer); this.vivoTimer = setTimeout(() => this.cargar(true), 75000); }
    };

    if (porAcs) {
      this.acsSvc.reiniciar(this.acs.id).subscribe({
        next: (r: any) => fin(r?.error === 0 ? 'El equipo se está reiniciando: vuelve en un minuto.' : (r?.message ?? 'No se pudo reiniciar.'), r?.error === 0),
        error: (e: any) => fin(e?.error?.message ?? 'No se pudo reiniciar.', false),
      });
      return;
    }

    const ont = this.ont!;
    this.gestion.reiniciar(ont.olt_id!, ont.fsp, ont.ont_id).subscribe({
      next: (r: any) => {
        const tarea = r?.data?.tarea;
        if (r?.error !== 0 || !tarea) { fin(r?.message ?? 'No se pudo reiniciar.', false); return; }

        this.tareas.seguir(tarea, `Reiniciando · ${this.cliente || ont.serial || 'equipo'}`, 'reiniciar').subscribe({
          next: (t: any) => {
            if (t?.estado === 'en_curso') return;
            fin(t?.estado === 'listo' ? 'El equipo se está reiniciando: vuelve en un minuto.' : (t?.detalle || 'No se pudo reiniciar.'), t?.estado === 'listo');
          },
          error: () => fin('Se perdió el seguimiento del reinicio.', false),
        });
      },
      error: (e: any) => fin(e?.error?.message ?? 'No se pudo reiniciar.', false),
    });
  }

  alternarTodo(): void {
    this.verTodo = !this.verTodo;
    if (this.verTodo && !this.parametros.length) this.cargarParametros();
  }

  private cargarParametros(): void {
    this.cargandoParametros = true;
    this.acsSvc.parametrosDeCliente(this.userId).subscribe({
      next: (r: any) => {
        this.cargandoParametros = false;
        this.parametros = (r?.data ?? []).map((p: any) => ({ ...p, corta: String(p.ruta).replace(/^(InternetGatewayDevice|Device)\./, '') }));
        this.filtrar();
      },
      error: () => { this.cargandoParametros = false; },
    });
  }

  filtrar(): void {
    const q = this.filtro.trim().toLowerCase();
    this.visibles = q ? this.parametros.filter(p => p.ruta.toLowerCase().includes(q) || (p.valor ?? '').toLowerCase().includes(q)) : this.parametros;
  }

  trackRuta = (_: number, p: Parametro) => p.ruta;
  trackI = (i: number) => i;

  // ── Formato ───────────────────────────────────────────────────────────────

  private num(n: number, decimales: number): string {
    return Number(n).toLocaleString('es-CO', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  }

  fecha(iso: string): string {
    const f = new Date(iso);
    if (isNaN(f.getTime())) return '—';
    return f.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) + ', ' + f.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  private hace(iso: string): string {
    return this.duracion(Math.max(0, (Date.now() - Date.parse(iso)) / 1000));
  }

  /** «2 d 5 h», «3 h 12 min», «45 s». */
  duracion(segundos: number): string {
    const s = Math.round(segundos);
    if (s < 60) return s + ' s';
    const m = Math.floor(s / 60);
    if (m < 60) return m + ' min';
    const h = Math.floor(m / 60);
    if (h < 24) return h + ' h ' + (m % 60) + ' min';
    return Math.floor(h / 24) + ' d ' + (h % 24) + ' h';
  }
}
