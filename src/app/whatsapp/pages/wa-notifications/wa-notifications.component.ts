import { Component, OnInit } from '@angular/core';
import { CommonModule }      from '@angular/common';
import { FormsModule }       from '@angular/forms';
import { RouterModule }      from '@angular/router';
import { CompanyWhatsappService } from '../../../services/company-whatsapp.service';
import { ToastService }           from '../../../services/toast.service';
import { NpSelectComponent, PresentacionSelect } from '../../../common/np-select/np-select.component';

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
}

/** Un aviso del catálogo con sus destinos. */
interface Aviso {
  clave: string;
  titulo: string;
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
  imports: [CommonModule, FormsModule, RouterModule, NpSelectComponent],
  templateUrl: './wa-notifications.component.html',
  styleUrl: './wa-notifications.component.scss',
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

  private catalogo: { clave: string; seccion: string; titulo: string; cuando: string; solo_grupo: boolean }[] = [];

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
