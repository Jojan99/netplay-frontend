import { Component, OnInit } from '@angular/core';
import { CommonModule }      from '@angular/common';
import { FormsModule }       from '@angular/forms';
import { RouterModule }      from '@angular/router';
import { CompanyWhatsappService } from '../../../services/company-whatsapp.service';
import { ToastService }           from '../../../services/toast.service';
import { SanitizeHtmlPipe }       from '../../../common/pipes';
import { NpSelectComponent, PresentacionSelect } from '../../../common/np-select/np-select.component';

/**
 * Un icono por aviso, dibujado como los del resto del panel: trazo de 1.8,
 * currentColor y viewBox 0 0 24 24. Antes el título del evento traía un emoji
 * adelante y cada sección se veía de un color distinto.
 *
 * La clave la manda el backend en `icono` (NotificationRouterService::catalogo).
 */
const ICONOS_AVISO: Record<string, string> = {
  // Tickets
  ticket:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4v-2a2 2 0 0 0 0-4z"/><path d="M9 12h6"/></svg>`,
  caja:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l9-4 9 4-9 4-9-4z"/><path d="M3 8v8l9 4 9-4V8M12 12v8"/></svg>`,
  estado:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/></svg>`,
  reabrir:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4v6h6"/><path d="M3.6 14.5a9 9 0 1 0 2.1-9.2L3 10"/></svg>`,
  // Clientes
  cliente:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0M17 11h4M19 9v4"/></svg>`,
  agenda:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="m9.5 15 2 2 3.5-4"/></svg>`,
  // Pagos
  pago:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5h.01M18 14.5h.01"/></svg>`,
  comprobante: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>`,
  // Red
  alerta:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4.5 2.8 19.5h18.4z"/><path d="M12 10v4M12 17.3h.01"/></svg>`,
  amanecer:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5v4M5.2 8.2l1.5 1.5M18.8 8.2l-1.5 1.5M2.5 16h3M18.5 16h3"/><path d="M8 16a4 4 0 0 1 8 0"/><path d="M3 20.5h18"/></svg>`,
};

/** Destinos: grupo o número, también en trazo y no en emoji. */
const ICONO_GRUPO  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5A5 5 0 0 1 22 19"/></svg>`;
const ICONO_NUMERO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>`;

/** Una fila de wa_notification_routes, con lo que la pantalla necesita ya calculado. */
interface Destino {
  id: number;
  destination: string;
  label: string;
  enabled: boolean;
  esGrupo: boolean;
  /** Cómo se lee: el nombre del grupo, o el número con espacios. */
  texto: string;
  /** El identificador crudo, abajo en chico. */
  detalle: string;
  /** SVG del tipo de destino, ya elegido: nunca se calcula en la plantilla. */
  icono: string;
}

/** Un aviso del catálogo con sus destinos. */
interface Aviso {
  clave: string;
  titulo: string;
  /** SVG del aviso, ya resuelto contra ICONOS_AVISO. */
  icono: string;
  cuando: string;
  soloGrupo: boolean;
  destinos: Destino[];
  encendido: boolean;
  resumen: string;
}

interface Seccion {
  nombre: string;
  avisos: Aviso[];
  /** Cuántos avisos de la sección tienen al menos un destino prendido. */
  activos: number;
}

interface GrupoWa { jid: string; name: string; participants: number; }

const ORDEN_SECCIONES = ['Tickets', 'Clientes', 'Pagos', 'Red'];

@Component({
  selector: 'app-wa-notifications',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, NpSelectComponent, SanitizeHtmlPipe],
  templateUrl: './wa-notifications.component.html',
  styleUrl: './wa-notifications.component.scss',
  host: { class: 'np-console' },
})
export class WaNotificationsComponent implements OnInit {
  cargando = true;
  guardando = false;
  probando: number | null = null;

  /** Lo que se dibuja. Se rearma en cada cambio: nunca un getter dentro de *ngFor. */
  secciones: Seccion[] = [];
  totalDestinos = 0;
  avisosPrendidos = 0;

  lineaConectada = false;
  waActivado = false;

  grupos: GrupoWa[] = [];
  cargandoGrupos = false;
  errorGrupos = '';

  // ── Modal de destino ───────────────────────────────────────────────────────
  modalAbierto = false;
  avisoEnEdicion: Aviso | null = null;
  destinoEnEdicion: Destino | null = null;
  tipoDestino: 'grupo' | 'numero' = 'grupo';
  grupoElegido: string | null = null;
  numero = '';
  etiqueta = '';
  errorModal = '';

  /** Cada grupo con su nombre y cuánta gente tiene, para no equivocarse de grupo. */
  readonly presGrupos: PresentacionSelect<GrupoWa> = {
    valor:     g => g.jid,
    clave:     g => g.jid,
    etiqueta:  g => g.name || g.jid,
    detalle:   g => `${g.participants} participantes`,
    buscarEn:  g => `${g.name} ${g.jid}`,
  };

  /** Los dos iconos de destino, para la plantilla. */
  readonly iconoGrupo  = ICONO_GRUPO;
  readonly iconoNumero = ICONO_NUMERO;

  private catalogo: { clave: string; seccion: string; titulo: string; icono?: string; cuando: string; solo_grupo: boolean }[] = [];

  constructor(
    private waService: CompanyWhatsappService,
    private toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  // ── Carga ──────────────────────────────────────────────────────────────────

  cargar(): void {
    this.cargando = true;
    this.waService.listNotificationRoutes().subscribe({
      next: res => {
        const datos = res?.data ?? {};
        this.catalogo       = datos.eventos ?? [];
        this.lineaConectada = !!datos.linea?.conectada;
        this.waActivado     = !!datos.linea?.wa_activado;
        this.armar(datos.routes ?? []);
        this.cargando = false;
        if (this.lineaConectada && !this.grupos.length) this.cargarGrupos();
      },
      error: () => {
        this.cargando = false;
        this.toast.error('No pudimos leer los avisos.');
      },
    });
  }

  cargarGrupos(): void {
    if (!this.lineaConectada) return;
    this.cargandoGrupos = true;
    this.errorGrupos = '';
    this.waService.getGroups().subscribe({
      next: res => {
        this.grupos = (res?.data?.groups ?? []).map((g: any) => ({
          jid:          g.jid ?? g.id ?? '',
          name:         g.name ?? g.subject ?? g.jid ?? '',
          participants: g.participants ?? g.size ?? 0,
        })).filter((g: GrupoWa) => !!g.jid);
        if (!this.grupos.length) this.errorGrupos = 'La línea no está en ningún grupo todavía.';
        this.cargandoGrupos = false;
      },
      error: () => {
        this.errorGrupos = 'No pudimos leer los grupos de la línea.';
        this.cargandoGrupos = false;
      },
    });
  }

  /** Arma las secciones a partir del catálogo y las rutas guardadas. */
  private armar(rutas: any[]): void {
    const porEvento = new Map<string, Destino[]>();

    for (const r of rutas) {
      const d = this.aDestino(r);
      const lista = porEvento.get(r.event_type) ?? [];
      lista.push(d);
      porEvento.set(r.event_type, lista);
    }

    const porSeccion = new Map<string, Aviso[]>();

    for (const e of this.catalogo) {
      const destinos  = porEvento.get(e.clave) ?? [];
      const prendidos = destinos.filter(d => d.enabled);
      const aviso: Aviso = {
        clave:     e.clave,
        titulo:    e.titulo,
        icono:     ICONOS_AVISO[e.icono ?? ''] ?? ICONOS_AVISO['ticket'],
        cuando:    e.cuando,
        soloGrupo: !!e.solo_grupo,
        destinos,
        encendido: prendidos.length > 0,
        resumen:   !destinos.length
          ? 'Sin destino: este aviso no se manda.'
          : prendidos.length === destinos.length
            ? ''
            : `${destinos.length - prendidos.length} destino(s) en pausa.`,
      };
      const lista = porSeccion.get(e.seccion) ?? [];
      lista.push(aviso);
      porSeccion.set(e.seccion, lista);
    }

    const nombres = [
      ...ORDEN_SECCIONES.filter(n => porSeccion.has(n)),
      ...[...porSeccion.keys()].filter(n => !ORDEN_SECCIONES.includes(n)),
    ];

    this.secciones = nombres.map(nombre => {
      const avisos = porSeccion.get(nombre)!;
      return { nombre, avisos, activos: avisos.filter(a => a.encendido).length };
    });

    this.totalDestinos   = rutas.length;
    this.avisosPrendidos = this.secciones.reduce((n, s) => n + s.activos, 0);
  }

  private aDestino(r: any): Destino {
    const destino = String(r.destination ?? '');
    const esGrupo = destino.includes('@g.us');
    const label   = r.label || '';

    return {
      id:          Number(r.id),
      destination: destino,
      label,
      enabled:     !!r.enabled,
      esGrupo,
      texto:       label || (esGrupo ? 'Grupo de WhatsApp' : this.numeroLegible(destino)),
      detalle:     esGrupo ? 'Grupo · ' + destino.replace('@g.us', '') : this.numeroLegible(destino),
      icono:       esGrupo ? ICONO_GRUPO : ICONO_NUMERO,
    };
  }

  /** 573001234567 → +57 300 123 4567 */
  private numeroLegible(destino: string): string {
    const n = destino.replace(/\D/g, '');
    if (n.length < 10) return destino;
    const pais = n.slice(0, n.length - 10);
    const resto = n.slice(-10);
    return `${pais ? '+' + pais + ' ' : ''}${resto.slice(0, 3)} ${resto.slice(3, 6)} ${resto.slice(6)}`;
  }

  // ── Encender / apagar ──────────────────────────────────────────────────────

  /** El interruptor del aviso prende o apaga todos sus destinos de una. */
  alternarAviso(aviso: Aviso): void {
    if (!aviso.destinos.length) {
      this.toast.warning('Primero elegí a dónde se manda este aviso.');
      return;
    }

    const prender = !aviso.encendido;
    let pendientes = aviso.destinos.length;

    for (const d of aviso.destinos) {
      this.waService.updateNotificationRoute(d.id, { enabled: prender }).subscribe({
        next: () => { if (--pendientes === 0) this.cargar(); },
        error: () => { this.toast.error('No se pudo guardar el cambio.'); this.cargar(); },
      });
    }
  }

  alternarDestino(destino: Destino): void {
    this.waService.updateNotificationRoute(destino.id, { enabled: !destino.enabled }).subscribe({
      next:  () => this.cargar(),
      error: () => this.toast.error('No se pudo guardar el cambio.'),
    });
  }

  // ── Alta, edición y baja de destinos ───────────────────────────────────────

  abrirNuevo(aviso: Aviso): void {
    this.avisoEnEdicion   = aviso;
    this.destinoEnEdicion = null;
    this.tipoDestino      = 'grupo';
    this.grupoElegido     = null;
    this.numero           = '';
    this.etiqueta         = '';
    this.errorModal       = '';
    this.modalAbierto     = true;
    if (this.lineaConectada && !this.grupos.length && !this.cargandoGrupos) this.cargarGrupos();
  }

  abrirEdicion(aviso: Aviso, destino: Destino): void {
    this.avisoEnEdicion   = aviso;
    this.destinoEnEdicion = destino;
    this.tipoDestino      = destino.esGrupo ? 'grupo' : 'numero';
    this.grupoElegido     = destino.esGrupo ? destino.destination : null;
    this.numero           = destino.esGrupo ? '' : destino.destination;
    this.etiqueta         = destino.label;
    this.errorModal       = '';
    this.modalAbierto     = true;
    if (this.lineaConectada && !this.grupos.length && !this.cargandoGrupos) this.cargarGrupos();
  }

  cerrarModal(): void {
    this.modalAbierto     = false;
    this.avisoEnEdicion   = null;
    this.destinoEnEdicion = null;
  }

  elegirTipo(tipo: 'grupo' | 'numero'): void {
    if (this.avisoEnEdicion?.soloGrupo && tipo === 'numero') return;
    this.tipoDestino = tipo;
    this.errorModal  = '';
  }

  guardarDestino(): void {
    const aviso = this.avisoEnEdicion;
    if (!aviso || this.guardando) return;

    let destino = '';

    if (this.tipoDestino === 'grupo') {
      if (!this.grupoElegido) { this.errorModal = 'Elegí un grupo de la lista.'; return; }
      destino = this.grupoElegido;
    } else {
      const digitos = this.numero.replace(/\D/g, '');
      if (digitos.length < 10 || digitos.length > 15) {
        this.errorModal = 'El número va con indicativo del país, por ejemplo 573001234567.';
        return;
      }
      destino = digitos;
    }

    // Sin etiqueta, la del grupo elegido: el dueño reconoce el nombre, no el JID.
    const nombreGrupo = this.grupos.find(g => g.jid === destino)?.name ?? '';
    const label = (this.etiqueta || (this.tipoDestino === 'grupo' ? nombreGrupo : '')).trim();

    this.guardando = true;

    const listo = (res: any) => {
      this.guardando = false;
      if (res?.error) { this.errorModal = res?.message ?? 'No se pudo guardar.'; return; }
      this.toast.success(res?.message ?? 'Listo.');
      this.cerrarModal();
      this.cargar();
    };
    const falla = () => { this.guardando = false; this.errorModal = 'No se pudo guardar.'; };

    if (this.destinoEnEdicion) {
      this.waService.updateNotificationRoute(this.destinoEnEdicion.id, { destination: destino, label })
        .subscribe({ next: listo, error: falla });
    } else {
      this.waService.createNotificationRoute({ event_type: aviso.clave, destination: destino, label })
        .subscribe({ next: listo, error: falla });
    }
  }

  eliminar(destino: Destino): void {
    if (!confirm(`¿Dejar de mandar este aviso a ${destino.texto}?`)) return;

    this.waService.deleteNotificationRoute(destino.id).subscribe({
      next:  () => { this.toast.success('Destino eliminado.'); this.cargar(); },
      error: () => this.toast.error('No se pudo eliminar.'),
    });
  }

  probar(destino: Destino): void {
    this.probando = destino.id;
    this.waService.probarNotificationRoute(destino.id).subscribe({
      next: res => {
        this.probando = null;
        res?.error
          ? this.toast.error(res?.message ?? 'No se pudo enviar.')
          : this.toast.success(res?.message ?? 'Mensaje de prueba enviado.');
      },
      error: () => { this.probando = null; this.toast.error('No se pudo enviar la prueba.'); },
    });
  }

  // ── trackBy ────────────────────────────────────────────────────────────────

  porSeccion = (_: number, s: Seccion) => s.nombre;
  porAviso   = (_: number, a: Aviso)   => a.clave;
  porDestino = (_: number, d: Destino) => d.id;
}
