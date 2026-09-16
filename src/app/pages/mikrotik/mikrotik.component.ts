import { DialogService } from '../../services/dialog.service';
import { ToastService } from '../../services/toast.service';
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NpSelectComponent, PresentacionSelect } from '../../common/np-select/np-select.component';
import { OpcionesDeIps, PRESENTACION_IPS, PRESENTACION_REDES, PRESENTACION_ROUTERS, conValor } from '../../common/np-select/presentaciones';
import { MikrotikService } from '../../services/mikrotik.service';
import { Router } from '@angular/router';
import { OntEquipoComponent } from '../../components/ont-equipo/ont-equipo.component';
import { buscarModelo, ModeloMikrotik, Puerto } from './modelos-mikrotik';

type EstadoPuerto = 'up' | 'down' | 'off' | 'na';

/** Un puerto con todo lo que la plantilla necesita, ya resuelto. */
interface PuertoVivo extends Puerto {
  etiqueta: string;
  estado: EstadoPuerto;
  nota: string;
  sfp: boolean;
  titulo: string;
  /** Como negoció: "1Gbps", "100Mbps". */
  velocidad: string | null;
  /** Negoció por debajo de lo que el puerto soporta. */
  degradado: boolean;
}

const ESTADOS: Record<EstadoPuerto, string> = {
  up: 'con enlace', down: 'sin enlace', off: 'deshabilitado', na: 'no presente',
};

@Component({
  selector: 'app-mikrotik',
  standalone: true,
  imports: [CommonModule, FormsModule, NpSelectComponent, OntEquipoComponent],
  templateUrl: './mikrotik.component.html',
  styleUrl: './mikrotik.component.scss',
  host: { class: 'np-console' },
})
export class MikrotikComponent implements OnInit {
  /** Cómo se ven las redes en el selector de VLAN: número de VLAN, segmento y clientes. */
  readonly redes = PRESENTACION_REDES;
  readonly ipsPresentacion = PRESENTACION_IPS;
  readonly opcionesIp = new OpcionesDeIps();

  /** Routers con IP y puerto. El select guardaba el id en texto ([value]): se sigue guardando así. */
  // El id queda como número: el título busca el router con r.id === selectedRouterId
  // y con texto no lo encontraba (decía "Router" en vez del nombre).
  readonly presRouters = conValor(PRESENTACION_ROUTERS, r => r.id);

  /** Interfaces del router: tipo abreviado a la izquierda y si ya tienen un servidor PPPoE escuchando. */
  readonly presInterfaces: PresentacionSelect = {
    valor: i => i?.nombre,
    etiqueta: i => i?.nombre ?? '',
    prefijo: i => ({ ether: 'ETH', vlan: 'VLAN', bridge: 'BR' } as Record<string, string>)[i?.tipo] ?? (i?.tipo ? String(i.tipo).slice(0, 4).toUpperCase() : null),
    detalle: i => ({ ether: 'Puerto físico', vlan: 'VLAN', bridge: 'Bridge' } as Record<string, string>)[i?.tipo] ?? i?.tipo ?? null,
    insignia: i => {
      // En el asistente, los servidores que leyó el asistente; en el modal de servidor, los del estado.
      const servidores = (this.editando === 'servidor' ? this.pppoe?.servidores : this.opcionesPppoe?.servidores) ?? [];
      return servidores.some((s: any) => s?.interfaz === i?.nombre) ? { texto: 'Con servidor PPPoE', tono: 'info' } : null;
    },
    buscarEn: i => [i?.nombre, i?.tipo].filter(Boolean).join(' '),
  };

  /** Salidas a internet: listas de interfaces (lo habitual, la WAN) e interfaces sueltas. */
  readonly presSalidas: PresentacionSelect = {
    valor: s => s?.nombre,
    etiqueta: s => s?.nombre ?? '',
    detalle: s => (s?.tipo === 'lista' ? 'Lista de interfaces' : s?.tipo === 'interfaz' ? 'Interfaz' : s?.tipo ?? null),
    grupo: s => (s?.tipo === 'lista' ? 'Listas de interfaces' : 'Interfaces'),
  };

  /** Rangos de IP con sus direcciones y cuántos perfiles reparten de cada uno. */
  readonly presPools: PresentacionSelect = {
    valor: p => p?.nombre,
    etiqueta: p => p?.nombre ?? '',
    detalle: p => p?.rangos || null,
    insignia: p => {
      const n = (this.pppoe?.perfiles ?? []).filter((x: any) => x?.pool === p?.nombre).length;
      return n ? { texto: `${n} ${n === 1 ? 'perfil' : 'perfiles'}`, tono: 'neutral' } : null;
    },
    buscarEn: p => [p?.nombre, p?.rangos].filter(Boolean).join(' '),
  };

  /** Perfiles PPP: velocidad (rate-limit), de qué rango reparten y cuántas credenciales los usan. */
  readonly presPerfiles: PresentacionSelect = {
    valor: p => p?.nombre,
    etiqueta: p => p?.nombre ?? '',
    detalle: p => [p?.velocidad ? `Velocidad ${p.velocidad}` : null, p?.pool ? `Reparte de ${p.pool}` : null].filter(Boolean).join(' · ') || null,
    insignia: (p, todos) => {
      if (p?.del_sistema) return { texto: 'Del sistema', tono: 'neutral' };
      if (p?.en_uso == null) return null;
      const n = Number(p.en_uso);
      const mayor = Math.max(1, ...todos.map(x => Number(x?.en_uso ?? 0)));
      return n ? { texto: `${n} en uso`, tono: 'ok', proporcion: n / mayor } : { texto: 'Sin usar', tono: 'neutral' };
    },
    atenuada: p => !!p?.del_sistema,
    buscarEn: p => [p?.nombre, p?.velocidad, p?.pool].filter(Boolean).join(' '),
  };

  /**
   * El select de router guardaba el id en texto, pero selectedRouterId arranca
   * con el número del backend. np-select compara estricto: se le pasa en texto
   * para que se vea elegido, y al cambiar recibe texto como antes.
   */
  comoTexto(v: unknown): string | null {
    return v == null ? null : String(v);
  }

  private dialog = inject(DialogService);
  private router = inject(Router);
  activeTab: 'info' | 'clients' | 'conflicts' | 'pppoe' | 'velocidades' | 'config' = 'info';

  tabs: { key: 'info' | 'clients' | 'conflicts' | 'pppoe' | 'velocidades' | 'config'; label: string }[] = [
    { key: 'info', label: 'Info Router' },
    { key: 'clients', label: 'Clientes ARP' },
    { key: 'conflicts', label: 'Conflictos de IP' },
    { key: 'pppoe', label: 'PPPoE' },
    { key: 'velocidades', label: 'Velocidades' },
    { key: 'config', label: 'Routers' },
  ];

  // ── Multi-router ──────────────────────────────────────────────────────────
  routers: any[] = [];
  selectedRouterId: number | null = null;
  loadingRouters = false;

  // ── Router info ───────────────────────────────────────────────────────────
  routerInfo: any = null;
  loadingInfo = false;
  /** Por qué no cargó: el router no contesta, rechazó el usuario, etc. */
  infoError = '';

  // ── Clients ───────────────────────────────────────────────────────────────
  clients: any[] = [];
  filteredClients: any[] = [];
  clientSearch = '';
  loadingClients = false;
  selectedIds = new Set<number>();
  suspending = false;
  suspendResult: string | null = null;
  suspendError = false;

  // ── Config: lista de routers ──────────────────────────────────────────────
  showRouterForm = false;
  editingRouter: any = null;
  routerForm = { name: '', host: '', user: '', pass: '', port: 8728 };
  savingRouter = false;
  routerFormMsg = '';
  routerFormError = false;
  showRouterPass = false;
  deletingRouterId: number | null = null;

  // ── PPPoE ─────────────────────────────────────────────────────────────────
  // Montar PPPoE a mano son cuatro cosas en cuatro pantallas de Winbox, y si
  // falta una nada funciona. Acá se hace en un paso.
  pppoe: any = null;
  pppoeUsuarios: any[] = [];
  loadingPppoe = false;
  pppoeError = '';

  montando = false;
  mostrarAsistente = false;
  opcionesPppoe: any = null;
  form = { interfaz: '', pool: '', rango: '', gateway: '', perfil: '', servicio: '', salida: '' };
  resultadoMontaje: any = null;

  /** El asistente va por pasos: cada uno es una decisión, no un formulario. */
  paso = 1;
  readonly ultimoPaso = 4;
  planesPppoe: any[] = [];

  readonly pasosPppoe = [
    { n: 1, titulo: 'Por dónde llegan', detalle: 'La interfaz donde están conectados los clientes' },
    { n: 2, titulo: 'Qué IP reparte',   detalle: 'El rango de direcciones y la puerta de enlace' },
    { n: 3, titulo: 'Los planes',       detalle: 'Un perfil por plan, con su velocidad' },
    { n: 4, titulo: 'Salida a internet',detalle: 'Por dónde navegan los clientes' },
  ];

  get pasoActual() {
    return this.pasosPppoe.find(p => p.n === this.paso) ?? this.pasosPppoe[0];
  }

  get puedeAvanzar(): boolean {
    if (this.paso === 1) return !!this.form.interfaz && !this.servidorEnInterfaz;
    if (this.paso === 2) {
      const f = this.form;
      return !!f.rango.trim() && !!f.gateway.trim() && !!f.pool.trim() && !!f.perfil.trim() && !!f.servicio.trim()
        && !this.yaExiste('pools', f.pool) && !this.yaExiste('perfiles', f.perfil) && !this.yaExiste('servidores', f.servicio)
        && !this.choquesPppoe?.length;
    }
    return true;
  }

  /** Lo que el router ya dice tener no se vuelve a proponer: se pisaría. */
  choquesPppoe: string[] | null = null;
  validandoPppoe = false;

  get servidorEnInterfaz(): string | null {
    const i = this.form.interfaz;
    return i ? ((this.opcionesPppoe?.servidores ?? []).find((s: any) => s.interfaz === i)?.nombre ?? null) : null;
  }

  yaExiste(lista: 'pools' | 'perfiles' | 'servidores', nombre: string): boolean {
    const n = (nombre ?? '').trim().toLowerCase();
    return !!n && (this.opcionesPppoe?.[lista] ?? []).some((x: any) => String(x.nombre ?? '').toLowerCase() === n);
  }

  siguientePaso() {
    if (this.paso >= this.ultimoPaso || !this.puedeAvanzar) return;
    if (this.paso !== 2) { this.paso++; return; }

    // Los rangos se cruzan de formas que no se ven a ojo: lo revisa el router.
    this.validandoPppoe = true;
    this.svc.validarPppoe({ ...this.form, router_id: this.selectedRouterId }).subscribe({
      next: r => {
        this.validandoPppoe = false;
        if (r?.error !== 0) { this.pppoeError = r?.message || 'No se pudo revisar el router.'; return; }
        this.choquesPppoe = r.data?.choques ?? [];
        if (!this.choquesPppoe!.length) this.paso++;
      },
      error: () => { this.validandoPppoe = false; this.pppoeError = 'No se pudo revisar el router.'; },
    });
  }

  pasoAnterior() {
    if (this.paso > 1) this.paso--;
  }

  get planesElegidos(): any[] {
    return this.planesPppoe.filter(p => p.crear);
  }

  loadPppoe() {
    this.loadingPppoe = true;
    this.pppoeError = '';

    this.svc.getPppoe(this.selectedRouterId).subscribe({
      next: r => {
        this.loadingPppoe = false;
        if (r?.error !== 0) { this.pppoeError = r?.message || 'No se pudo leer el router.'; return; }
        this.pppoe = r.data?.estado ?? null;
        this.pppoeUsuarios = r.data?.usuarios ?? [];
        this.pppoePools = r.data?.pools ?? [];
        this.pppoeInterfaces = r.data?.interfaces ?? [];
      },
      error: () => { this.loadingPppoe = false; this.pppoeError = 'No se pudo leer el router.'; },
    });
  }

  /** Primero se elige cómo: automático por VLAN o paso a paso. */
  modoAsistente: 'elegir' | 'auto' | 'manual' = 'elegir';
  propuestaPppoe: any = null;
  resultadoAuto: any = null;

  abrirAsistente() {
    this.mostrarAsistente = true;
    this.modoAsistente = 'elegir';
    this.resultadoMontaje = null;
    this.resultadoAuto = null;
    this.pppoeError = '';
  }

  elegirAutomatico() {
    this.modoAsistente = 'auto';
    this.propuestaPppoe = null;
    this.resultadoAuto = null;
    this.pppoeError = '';

    this.svc.getPppoePropuesta(this.selectedRouterId).subscribe({
      next: r => {
        if (r?.error !== 0) { this.pppoeError = r?.message || 'No se pudo leer el router.'; return; }
        // Nada marcado de entrada en las VLAN: cada una se elige a conciencia.
        // Las velocidades mal escritas sí: arreglarlas nunca empeora nada.
        this.propuestaPppoe = {
          ...r.data,
          vlans: (r.data?.vlans ?? []).map((v: any) => ({ ...v, crear: false })),
          sin_unidad: (r.data?.sin_unidad ?? []).map((p: any) => ({ ...p, corregir: true })),
        };
      },
      error: () => { this.pppoeError = 'No se pudo leer el router.'; },
    });
  }

  porInterfaz = (_: number, v: any) => v.interfaz;

  get cambiosAuto(): number {
    const p = this.propuestaPppoe;
    if (!p) return 0;
    return p.vlans.filter((v: any) => v.crear && !v.tiene).length + p.sin_unidad.filter((x: any) => x.corregir).length;
  }

  async montarAutomatico() {
    const p = this.propuestaPppoe;
    const vlans = p.vlans.filter((v: any) => v.crear && !v.tiene);
    const corregir = p.sin_unidad.filter((x: any) => x.corregir);

    const partes = [];
    if (vlans.length) partes.push(`crear PPPoE en la${vlans.length > 1 ? 's' : ''} VLAN ${vlans.map((v: any) => v.vlan).join(', ')}`);
    if (corregir.length) partes.push(`corregir la velocidad de ${corregir.map((x: any) => x.perfil).join(', ')}`);

    const ok = await this.dialog.confirm(`Se va a ${partes.join(' y ')} en el router. Los clientes que ya navegan no se cortan. ¿Confirmás?`, { okLabel: 'Crear' });
    if (!ok) return;

    this.montando = true;
    this.pppoeError = '';
    this.svc.pppoeAutomatico({
      interfaces: vlans.map((v: any) => v.interfaz),
      corregir: corregir.map((x: any) => x.perfil),
      router_id: this.selectedRouterId,
    }).subscribe({
      next: r => {
        this.montando = false;
        this.resultadoAuto = r?.data ?? { ok: false, pasos: [] };
        if (!r?.data) this.pppoeError = r?.message || 'No se pudo configurar.';
        this.loadPppoe();
      },
      error: () => { this.montando = false; this.pppoeError = 'No se pudo configurar el router.'; },
    });
  }

  elegirManual() {
    this.modoAsistente = 'manual';
    this.choquesPppoe = null;
    this.resultadoMontaje = null;
    this.opcionesPppoe = null;
    this.paso = 1;
    this.planesPppoe = [];

    this.svc.getPppoeOpciones(this.selectedRouterId).subscribe({
      next: r => {
        if (r?.error !== 0) { this.pppoeError = r?.message || 'No se pudo leer el router.'; return; }

        this.opcionesPppoe = r.data;
        const s = r.data?.sugerencia ?? {};

        this.form = {
          interfaz: '',
          pool: s.pool ?? 'pool-pppoe',
          rango: s.rango ?? '',
          gateway: s.gateway ?? '',
          perfil: s.perfil ?? 'perfil-pppoe',
          servicio: s.servicio ?? 'pppoe-netplay',
          // La lista de WAN si existe: es lo habitual en routers ya armados.
          salida: (r.data?.salidas ?? []).find((x: any) => x.tipo === 'lista')?.nombre ?? '',
        };

        // Todos los planes marcados: lo normal es querer un perfil por cada uno.
        this.planesPppoe = (r.data?.planes ?? []).map((p: any) => ({ ...p, crear: true }));
      },
      error: () => { this.pppoeError = 'No se pudo leer el router.'; },
    });
  }

  private interfacesPppoeDe: any[] | null = null;
  private interfacesPppoe: any[] = [];

  /** Sólo las interfaces por donde tiene sentido escuchar clientes. */
  get interfacesParaPppoe(): any[] {
    // Mismo arreglo mientras no cambien las opciones: el np-select recalcula
    // su lista cada vez que recibe uno nuevo, y el getter corre en cada ciclo.
    const todas = this.opcionesPppoe?.interfaces ?? null;
    if (todas !== this.interfacesPppoeDe) {
      this.interfacesPppoeDe = todas;
      this.interfacesPppoe = (todas ?? []).filter((i: any) => ['ether', 'vlan', 'bridge'].includes(i.tipo));
    }
    return this.interfacesPppoe;
  }

  async montarPppoe() {
    if (!this.form.interfaz) { this.pppoeError = 'Elegí la interfaz por donde llegan los clientes.'; return; }

    const perfiles = this.planesElegidos.length;

    const ok = await this.dialog.confirm(
      `Se va a configurar el servidor PPPoE en «${this.form.interfaz}», con el rango ${this.form.rango}, ` +
      `puerta de enlace ${this.form.gateway}` +
      (perfiles ? `, ${perfiles} perfil(es) de plan` : '') +
      (this.form.salida ? ` y salida a internet por «${this.form.salida}»` : '') +
      `. Se escribe en el router. ¿Confirmás?`,
      { okLabel: 'Configurar' },
    );

    if (!ok) return;

    this.montando = true;
    this.pppoeError = '';

    this.svc.montarPppoe({
      ...this.form,
      perfiles: this.planesElegidos,
      router_id: this.selectedRouterId,
    }).subscribe({
      next: r => {
        this.montando = false;
        this.resultadoMontaje = r.data;
        if (r?.error !== 0) { this.pppoeError = r?.message || 'No se pudo configurar.'; return; }
        this.loadPppoe();
      },
      error: () => { this.montando = false; this.pppoeError = 'No se pudo configurar el servidor.'; },
    });
  }

  cerrarAsistente() {
    this.mostrarAsistente = false;
    this.resultadoMontaje = null;
  }

  get conectados(): number {
    return this.pppoeUsuarios.filter(u => !!u.sesion).length;
  }

  /** Qué se ve en la pestaña. */
  vistaPppoe: 'conectados' | 'usuarios' | 'perfiles' | 'pools' | 'servidores' = 'conectados';

  pppoePools: any[] = [];
  pppoeInterfaces: any[] = [];

  // ── Crear y editar perfiles, rangos y servidores ──────────────────────────
  // Los tres se editan igual —abrir, llenar, guardar— así que comparten el
  // mismo modal en vez de repetir tres formularios casi iguales.
  editando: 'perfil' | 'pool' | 'servidor' | null = null;
  edita: any = {};
  guardandoPppoe = false;
  errorEdicion = '';

  get tituloEdicion(): string {
    const q = { perfil: 'perfil', pool: 'rango de IP', servidor: 'servidor' }[this.editando ?? 'perfil'];
    return (this.edita?.nombre_anterior ? 'Editar ' : 'Nuevo ') + q;
  }

  nuevoPerfil() {
    this.editando = 'perfil';
    this.errorEdicion = '';
    this.edita = {
      nombre: '', nombre_anterior: null, velocidad: '',
      gateway: '', pool: this.pppoePools[0]?.nombre ?? '', dns: '', una_sesion: true,
    };
  }

  editarPerfil(p: any) {
    this.editando = 'perfil';
    this.errorEdicion = '';
    this.edita = {
      nombre: p.nombre, nombre_anterior: p.nombre,
      velocidad: p.velocidad ?? '', gateway: p.direccion_local ?? '',
      pool: p.pool ?? '', dns: p.dns ?? '', una_sesion: !!p.una_sesion,
    };
  }

  nuevoPool() {
    this.editando = 'pool';
    this.errorEdicion = '';
    this.edita = { nombre: '', nombre_anterior: null, rangos: '' };
  }

  editarPool(p: any) {
    this.editando = 'pool';
    this.errorEdicion = '';
    this.edita = { nombre: p.nombre, nombre_anterior: p.nombre, rangos: p.rangos };
  }

  nuevoServidor() {
    this.editando = 'servidor';
    this.errorEdicion = '';
    this.edita = {
      servicio: 'pppoe-netplay', nombre_anterior: null,
      interfaz: '', perfil: this.pppoe?.perfiles?.[0]?.nombre ?? 'default', una_sesion: true,
    };
  }

  editarServidor(sv: any) {
    this.editando = 'servidor';
    this.errorEdicion = '';
    this.edita = {
      servicio: sv.nombre, nombre_anterior: sv.nombre,
      interfaz: sv.interfaz, perfil: sv.perfil, una_sesion: !!sv.una_sesion,
    };
  }

  cerrarEdicion() {
    this.editando = null;
    this.edita = {};
    this.errorEdicion = '';
  }

  guardarEdicion() {
    this.guardandoPppoe = true;
    this.errorEdicion = '';

    this.svc.guardarPppoe({ que: this.editando, ...this.edita, router_id: this.selectedRouterId }).subscribe({
      next: r => {
        this.guardandoPppoe = false;
        if (r?.error !== 0) { this.errorEdicion = r?.message || 'No se pudo guardar.'; return; }
        this.cerrarEdicion();
        this.loadPppoe();
      },
      error: () => { this.guardandoPppoe = false; this.errorEdicion = 'No se pudo guardar.'; },
    });
  }

  async borrarPppoe(que: string, nombre: string, aviso?: string) {
    const ok = await this.dialog.confirm(
      `¿Eliminar ${que === 'pool' ? 'el rango' : 'el ' + que} «${nombre}»?` + (aviso ? ' ' + aviso : ''),
      { okLabel: 'Eliminar', danger: true },
    );

    if (!ok) return;

    this.svc.eliminarPppoe({ que, nombre, router_id: this.selectedRouterId }).subscribe({
      next: r => {
        // El motivo importa: casi siempre es que algo lo está usando.
        if (r?.error !== 0) { this.pppoeError = r?.message || 'No se pudo eliminar.'; return; }
        this.pppoeError = '';
        this.loadPppoe();
      },
      error: () => { this.pppoeError = 'No se pudo eliminar.'; },
    });
  }

  // ── Credencial: su cliente, su sesión y su ONT ─────────────────────────────
  /** La credencial abierta en el detalle. */
  credencial: any = null;
  borrandoCred = false;

  abrirCredencial(u: any) {
    this.credencial = u;
  }

  cerrarCredencial() {
    this.credencial = null;
  }

  /** La ficha del cliente en su módulo; ?q acota la lista y ?cliente la abre. */
  abrirFicha(u: any) {
    if (!u?.user_id) return;
    this.router.navigate(['/dashboard/usuario'], { queryParams: { q: u.ficha?.documento ?? u.comentario ?? '', cliente: u.user_id, tab: 'servicios' } });
  }

  async borrarCredencial(u: any) {
    if (this.borrandoCred) return;

    const avisos: string[] = [];
    if (u.sesion) avisos.push(`Está conectado ahora (${u.sesion.ip}): se le corta la conexión.`);
    if (u.cliente && !u.ficha?.eliminado && u.ficha?.conexion === 'pppoe') {
      avisos.push(`${u.cliente} sigue registrado por PPPoE y queda sin servicio hasta que se le cree otra credencial.`);
    }
    if (u.ficha?.eliminado) avisos.push('Es de un cliente eliminado.');

    const ok = await this.dialog.confirm(
      `¿Eliminar la credencial «${u.usuario}» del MikroTik?` + (avisos.length ? ' ' + avisos.join(' ') : ''),
      { okLabel: 'Eliminar credencial', danger: true },
    );
    if (!ok) return;

    this.borrandoCred = true;
    this.svc.eliminarPppoe({ que: 'usuario', nombre: u.usuario, router_id: this.selectedRouterId }).subscribe({
      next: r => {
        this.borrandoCred = false;
        if (r?.error !== 0) { this.pppoeError = r?.message || 'No se pudo eliminar.'; return; }
        this.pppoeError = '';
        this.cerrarCredencial();
        this.loadPppoe();
      },
      error: () => { this.borrandoCred = false; this.pppoeError = 'No se pudo eliminar la credencial.'; },
    });
  }

  // ── Velocidades ─────────────────────────────────────────────────────────
  planes: any[] = [];
  cargandoPlanes = false;
  /** El plan que se está editando; los demás quedan como están. */
  planEdita: any = null;
  guardandoPlan = false;
  aplicandoPlan = 0;
  /** Cortar la sesión es lo único que hace que un PPPoE tome la velocidad nueva. */
  reconectarAlAplicar: Record<number, boolean> = {};
  resultadoPlan: { texto: string; tipo: 'ok' | 'warn' } | null = null;

  cargarVelocidades() {
    this.cargandoPlanes = true;
    this.svc.getVelocidades().subscribe({
      next: (r: any) => {
        this.cargandoPlanes = false;
        if (r?.error !== 0) { this.toast.error(r?.message || 'No se pudieron leer los planes.'); return; }
        this.planes = r.data ?? [];
      },
      error: () => { this.cargandoPlanes = false; },
    });
  }

  editarPlan(p: any) {
    this.resultadoPlan = null;
    this.planEdita = {
      id: p.id,
      nombre: p.nombre,
      bajada: p.bajada ?? 100,
      subida: p.subida ?? 50,
      rafaga: !!p.rafaga,
      rafaga_bajada: p.rafaga_bajada ?? Math.round((p.bajada ?? 100) * 1.5),
      rafaga_subida: p.rafaga_subida ?? Math.round((p.subida ?? 50) * 1.5),
      rafaga_segundos: p.rafaga_segundos || 8,
      prioridad: p.prioridad || 8,
    };
  }

  /** Lo que va a sentir el cliente, antes de guardar nada. */
  get vistaPreviaPlan(): string {
    const e = this.planEdita;
    if (!e) return '';
    let t = `Baja a ${e.bajada} Mb y sube a ${e.subida} Mb.`;
    if (e.rafaga) t += ` Los primeros ${e.rafaga_segundos} segundos puede llegar a ${e.rafaga_bajada} Mb de bajada y ${e.rafaga_subida} de subida.`;
    return t;
  }

  guardarPlan() {
    if (!this.planEdita) return;
    this.guardandoPlan = true;
    this.svc.guardarVelocidad(this.planEdita.id, this.planEdita).subscribe({
      next: (r: any) => {
        this.guardandoPlan = false;
        if (r?.error !== 0) { this.toast.error(r?.message || 'No se pudo guardar.'); return; }
        this.toast.success('Velocidad guardada. Falta aplicarla en el router.');
        this.planEdita = null;
        this.cargarVelocidades();
      },
      error: () => { this.guardandoPlan = false; this.toast.error('No se pudo guardar.'); },
    });
  }

  async aplicarPlan(p: any) {
    const reconectar = !!this.reconectarAlAplicar[p.id];

    const ok = await this.dialog.confirm(
      `¿Aplicar la velocidad de «${p.nombre}» en el router? Alcanza a ${p.clientes.pppoe + p.clientes.ip_fija} clientes.`
      + (p.clientes.sin_limite ? ` ${p.clientes.sin_limite} quedan fuera por estar sin límite.` : '')
      + (reconectar && p.clientes.pppoe
        ? ` Se van a cortar ${p.clientes.pppoe} sesiones PPPoE: vuelven solas en segundos y ahí toman la velocidad nueva.`
        : ''),
      { okLabel: 'Aplicar', danger: reconectar && p.clientes.pppoe > 0 },
    );
    if (!ok) return;

    this.aplicandoPlan = p.id;
    this.resultadoPlan = null;
    this.svc.aplicarVelocidad(p.id, this.selectedRouterId, reconectar).subscribe({
      next: (r: any) => {
        this.aplicandoPlan = 0;
        if (r?.error !== 0) { this.toast.error(r?.message || 'No se pudo aplicar.'); return; }
        this.resultadoPlan = {
          texto: r.data?.mensaje ?? 'Aplicado',
          tipo: (r.data?.avisos ?? []).length ? 'warn' : 'ok',
        };
        (r.data?.avisos ?? []).slice(0, 3).forEach((a: string) => this.toast.error(a));
        this.cargarVelocidades();
      },
      error: () => { this.aplicandoPlan = 0; this.toast.error('No se pudo aplicar.'); },
    });
  }

  get sesionesPppoe(): any[] {
    return this.pppoeUsuarios.filter(u => !!u.sesion);
  }

  /** El servidor quedó creado pero el router no lo pudo levantar. */
  get servidorInvalido(): boolean {
    return (this.pppoe?.servidores ?? []).some((s: any) => s.invalido);
  }

  // ── Desmontar PPPoE ───────────────────────────────────────────────────────
  mostrarBaja = false;
  queSeBorra: any = null;
  bajaOpciones = { usuarios: false, perfiles: true, pool: true };
  desmontando = false;
  resultadoBaja: any = null;

  abrirBaja() {
    this.mostrarBaja = true;
    this.queSeBorra = null;
    this.resultadoBaja = null;
    this.bajaOpciones = { usuarios: false, perfiles: true, pool: true };

    this.svc.getPppoeQueSeBorra(this.selectedRouterId).subscribe({
      next: r => {
        if (r?.error !== 0) { this.pppoeError = r?.message || 'No se pudo leer el router.'; return; }
        this.queSeBorra = r.data;
      },
      error: () => { this.pppoeError = 'No se pudo leer el router.'; },
    });
  }

  get perfilesBaja(): string {
    return (this.queSeBorra?.perfiles ?? []).map((p: any) => p.nombre).join(', ');
  }

  cerrarBaja() {
    this.mostrarBaja = false;
    this.queSeBorra = null;
    this.resultadoBaja = null;
  }

  async confirmarBaja() {
    const q = this.queSeBorra;
    if (!q) return;

    const usuarios = this.bajaOpciones.usuarios ? q.usuarios.length : 0;

    const ok = await this.dialog.confirm(
      `Se va a quitar el servidor PPPoE del router.` +
      (q.conectados ? ` Hay ${q.conectados} cliente(s) conectados ahora mismo: se les corta el servicio.` : '') +
      (usuarios ? ` Además se borran ${usuarios} credencial(es) de cliente, y eso no se puede deshacer.` : '') +
      ` ¿Confirmás?`,
      { okLabel: 'Quitar PPPoE', danger: true },
    );

    if (!ok) return;

    this.desmontando = true;
    this.pppoeError = '';

    this.svc.desmontarPppoe({
      ...this.bajaOpciones,
      nombre_pool: q.pool,
      router_id: this.selectedRouterId,
    }).subscribe({
      next: r => {
        this.desmontando = false;
        this.resultadoBaja = r.data;
        if (r?.error !== 0) { this.pppoeError = r?.message || 'No se pudo desmontar.'; return; }
        this.loadPppoe();
      },
      error: () => { this.desmontando = false; this.pppoeError = 'No se pudo desmontar.'; },
    });
  }

  // ── Conflictos de IP ──────────────────────────────────────────────────────
  // Dos clientes con la misma IP se pelean el ARP del router: a los dos les
  // anda el internet a ratos. Acá se listan para irlos resolviendo de a uno.
  conflicts: any[] = [];
  loadingConflicts = false;
  conflictsError = '';
  conflictsSummary: any = null;
  soloUrgentes = false;

  loadConflicts() {
    this.loadingConflicts = true;
    this.conflictsError = '';
    this.svc.getIpConflicts().subscribe({
      next: r => {
        this.loadingConflicts = false;
        if (r?.error !== 0) { this.conflictsError = r?.message || 'No se pudo leer la lista.'; return; }
        this.conflictsSummary = r.data?.resumen ?? null;
        this.conflicts = [...(r.data?.compartidas ?? []), ...(r.data?.repetidas ?? [])];
      },
      error: () => {
        this.loadingConflicts = false;
        this.conflictsError = 'No se pudo leer la lista de conflictos.';
      },
    });
  }

  get conflictsVisibles(): any[] {
    return this.soloUrgentes ? this.conflicts.filter(c => c.urgente) : this.conflicts;
  }

  /** Por qué está repetida, en palabras del negocio. */
  explicacion(c: any): string {
    if (c.solo_dato) {
      return 'En el router esta IP la tiene un solo cliente: el otro la hereda del registro compartido. ' +
             'Se arregla separando los registros, sin tocar el MikroTik.';
    }

    return c.tipo === 'ficha'
      ? 'Comparten el mismo registro de asignación: cambiarle la IP a uno se la cambia a todos.'
      : 'Registros distintos con la misma IP, y los dos la tienen en el router: hay que cambiarle la IP a uno.';
  }

  /** Qué dice el router de este cliente. */
  enRouter(cliente: any, grupo: any): string {
    if (cliente.ip_router === null || cliente.ip_router === undefined) return '—';
    if (!cliente.ip_router) return 'sin entrada';
    return cliente.ip_router === grupo.ip ? 'esta IP' : cliente.ip_router;
  }

  // ── Arreglo automático: separar los registros compartidos ─────────────────
  // La mayoría de los "conflictos" no son de red: son clientes pegados al
  // registro de otro. En el router uno solo tiene esa IP y el resto ni
  // aparece. Separar los registros los resuelve todos de una, sin tocar el
  // MikroTik y sin cortarle el servicio a nadie.
  separando = false;
  separarPreview: any = null;
  separarError = '';

  simularSeparar() {
    this.separando = true;
    this.separarError = '';
    this.separarPreview = null;

    this.svc.separarFichas(true).subscribe({
      next: r => {
        this.separando = false;
        if (r?.error !== 0) { this.separarError = r?.message || 'No se pudo leer el router.'; return; }
        const s = r.data?.separados ?? [];
        this.separarPreview = {
          separados: s,
          conIp: s.filter((x: any) => !!x.ahora),
          sinIp: s.filter((x: any) => !x.ahora),
          conflictos: r.data?.conflictos ?? [],
        };
      },
      error: () => {
        this.separando = false;
        this.separarError = 'No se pudo leer el router. No se cambió nada.';
      },
    });
  }

  async aplicarSeparar() {
    const p = this.separarPreview;
    if (!p) return;

    const ok = await this.dialog.confirm(
      `Se le va a dar registro propio a ${p.separados.length} cliente(s): ` +
      `${p.conIp.length} quedan con la IP que tienen en el router y ${p.sinIp.length} sin IP, ` +
      `porque hoy no tienen entrada en el MikroTik. No se toca el router ni se corta ningún servicio. ¿Confirmás?`,
      { okLabel: 'Separar registros' },
    );

    if (!ok) return;

    this.separando = true;
    this.separarError = '';

    this.svc.separarFichas(false).subscribe({
      next: r => {
        this.separando = false;
        if (r?.error !== 0) { this.separarError = r?.message || 'No se pudo aplicar.'; return; }
        this.separarPreview = null;
        this.loadConflicts();
      },
      error: () => {
        this.separando = false;
        this.separarPreview = null;
        this.separarError = 'Se cortó la respuesta del servidor. Puede que sí se haya aplicado: revisá la lista, que se está recargando.';
        this.loadConflicts();
      },
    });
  }

  cerrarSeparar() {
    this.separarPreview = null;
    this.separarError = '';
  }

  // ── Sincronizar con el router ─────────────────────────────────────────────
  // El MikroTik identifica al cliente por su documento, así que se puede leer
  // de ahí la IP con la que realmente navega y dejarla igual en el sistema.
  // Corre solo cada hora; el botón sirve para hacerlo ahora y para mirar antes
  // qué cambiaría.
  sincronizando = false;
  syncPreview: any = null;
  syncError = '';

  simularSync() {
    this.sincronizando = true;
    this.syncError = '';
    this.syncPreview = null;

    this.svc.syncIps(true).subscribe({
      next: r => {
        this.sincronizando = false;
        if (r?.error !== 0) { this.syncError = r?.message || 'No se pudo leer el router.'; return; }
        this.syncPreview = this.resumirSync(r.data);
      },
      error: () => {
        this.sincronizando = false;
        this.syncError = 'No se pudo leer el router. No se cambió nada.';
      },
    });
  }

  private resumirSync(d: any) {
    const cambios = d?.cambios ?? [];
    return {
      faltaban: cambios.filter((c: any) => c.tipo === 'faltaba'),
      cambios:  cambios.filter((c: any) => c.tipo === 'cambio'),
      sinCambio: d?.sin_cambio ?? 0,
      desconocidos: d?.desconocidos ?? [],
      ambiguos: d?.ambiguos ?? [],
      errores: d?.errores ?? [],
    };
  }

  async aplicarSync() {
    const p = this.syncPreview;
    if (!p) return;

    const total = p.faltaban.length + p.cambios.length;

    const ok = await this.dialog.confirm(
      `Se va a guardar la IP del router en ${total} cliente(s): ` +
      `${p.faltaban.length} que no tenían IP registrada y ${p.cambios.length} que la tenían distinta. ` +
      `No se toca el router, sólo la plataforma. ¿Confirmás?`,
      { okLabel: 'Sincronizar' },
    );

    if (!ok) return;

    this.sincronizando = true;
    this.syncError = '';

    this.svc.syncIps(false).subscribe({
      next: r => {
        this.sincronizando = false;
        if (r?.error !== 0) { this.syncError = r?.message || 'No se pudo sincronizar.'; return; }
        this.syncPreview = null;
        this.loadConflicts();
      },
      // Que se corte la respuesta no significa que no se haya aplicado: el
      // proceso sigue del lado del servidor. Antes esto decía "no se pudo" y
      // el cambio en realidad ya estaba hecho, así que se vuelve a leer el
      // estado real y se cuenta lo que se ve.
      error: () => {
        this.sincronizando = false;
        this.syncPreview = null;
        this.syncError = 'Se cortó la respuesta del servidor. Puede que la sincronización sí se haya aplicado: revisá la lista, que se está recargando.';
        this.loadConflicts();
      },
    });
  }

  cerrarSync() {
    this.syncPreview = null;
    this.syncError = '';
  }

  // ── Resolver un conflicto: darle otra IP a un cliente ──────────────────────
  fixCliente: any = null;
  fixGrupo: any = null;
  fixVlans: any[] = [];
  fixVlan: any = null;
  fixIps: any[] = [];
  fixIp = '';
  loadingFixIps = false;
  fixError = '';
  guardandoFix = false;

  abrirCambioDeIp(grupo: any, cliente: any) {
    this.fixGrupo = grupo;
    this.fixCliente = cliente;
    this.fixVlan = null;
    this.fixIps = [];
    this.fixIp = '';
    this.fixError = '';
    this.fixVlans = [];

    // Las VLAN se piden por el router del cliente, no por el que esté
    // seleccionado arriba: pueden no ser el mismo.
    this.svc.getLanSegments(cliente.router_id ?? this.selectedRouterId).subscribe({
      next: r => {
        this.fixVlans = r?.error === 0 && r.data ? Object.values(r.data) : [];
        if (!this.fixVlans.length) this.fixError = 'El router no devolvió VLAN.';
      },
      error: () => { this.fixError = 'No se pudo conectar con el router del cliente.'; },
    });
  }

  cerrarCambioDeIp() {
    this.fixCliente = null;
    this.fixGrupo = null;
  }

  onFixVlanChange(vlan: any) {
    this.fixVlan = vlan;
    this.fixIp = '';
    this.fixIps = [];
    if (vlan) this.cargarFixIps();
  }

  cargarFixIps(intento = 1) {
    if (!this.fixVlan) return;
    this.loadingFixIps = true;
    this.fixError = '';

    const routerId = this.fixCliente?.router_id ?? this.selectedRouterId;

    this.svc.getIpAvalibles(this.fixVlan.names, routerId, this.fixVlan.network).subscribe({
      next: r => {
        if (r?.error !== 0) {
          if (intento < 3) { setTimeout(() => this.cargarFixIps(intento + 1), 900 * intento); return; }
          this.loadingFixIps = false;
          this.fixIps = [];
          this.fixError = r?.message || 'El router no respondió.';
          return;
        }
        this.loadingFixIps = false;
        this.fixIps = this.opcionesIp.recordar((r.data?.ips ?? []).map((e: any) => e.ip), r.data?.ocupadas);
        if (!this.fixIps.length) this.fixError = 'No quedan IPs libres en esta VLAN.';
      },
      error: () => {
        if (intento < 3) { setTimeout(() => this.cargarFixIps(intento + 1), 900 * intento); return; }
        this.loadingFixIps = false;
        this.fixIps = [];
        this.fixError = 'No se pudo conectar con el router.';
      },
    });
  }

  async confirmarCambioDeIp() {
    if (!this.fixCliente || !this.fixIp || !this.fixVlan) return;

    const ok = await this.dialog.confirm(
      `Se le va a asignar la IP ${this.fixIp} a ${this.fixCliente.nombre}. ` +
      `El cambio se aplica en el router y le corta la conexión un momento. ¿Confirmás?`,
      { okLabel: 'Cambiar la IP' },
    );

    if (!ok) return;

    this.guardandoFix = true;

    this.svc.migrarIp({
      service_id: this.fixCliente.user_id,
      new_ip: this.fixIp,
      vlan: this.fixVlan.names,
      router_id: this.fixCliente.router_id ?? this.selectedRouterId,
    }).subscribe({
      next: r => {
        this.guardandoFix = false;
        if (r?.error !== 0) { this.fixError = r?.message || 'No se pudo cambiar la IP.'; return; }
        this.cerrarCambioDeIp();
        this.loadConflicts();
      },
      error: () => { this.guardandoFix = false; this.fixError = 'No se pudo cambiar la IP.'; },
    });
  }

  private toast = inject(ToastService);

  constructor(private svc: MikrotikService) {}

  ngOnInit() {
    this.loadRouters();
  }

  // ── Routers list ──────────────────────────────────────────────────────────

  loadRouters() {
    this.loadingRouters = true;
    this.svc.getRouters().subscribe({
      next: r => {
        this.routers = r.data ?? [];
        this.loadingRouters = false;
        if (!this.selectedRouterId && this.routers.length) {
          this.selectedRouterId = this.routers[0].id;
        }
        this.loadInfo();
      },
      error: () => { this.loadingRouters = false; this.loadInfo(); },
    });
  }

  get selectedRouterHost(): string {
    const r = this.routers.find(x => x.id === this.selectedRouterId);
    return r ? `${r.host}:${r.port}` : '';
  }

  get selectedRouterLabel(): string {
    const r = this.routers.find(x => x.id === this.selectedRouterId);
    return r ? (r.name || r.host) : 'Router';
  }

  onRouterChange() {
    if (this.activeTab === 'info') this.loadInfo();
    else if (this.activeTab === 'clients') this.loadClients();
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────

  setTab(tab: 'info' | 'clients' | 'conflicts' | 'pppoe' | 'velocidades' | 'config') {
    this.activeTab = tab;
    if (tab === 'info')      { this.loadInfo(); }
    if (tab === 'clients')   { if (!this.clients.length) this.loadClients(); }
    if (tab === 'conflicts') { if (!this.conflicts.length) this.loadConflicts(); }
    if (tab === 'pppoe')     { this.loadPppoe(); }
    if (tab === 'velocidades') { this.cargarVelocidades(); }
    if (tab === 'config')    { this.loadRouters(); }
  }

  refresh() {
    if (this.activeTab === 'info')    this.loadInfo();
    else if (this.activeTab === 'clients') this.loadClients();
    else if (this.activeTab === 'conflicts') this.loadConflicts();
    else if (this.activeTab === 'pppoe') this.loadPppoe();
  }

  // ── Ficha del equipo ──────────────────────────────────────────────────────
  // La foto del modelo se pide aparte para no demorar la pantalla, y el panel
  // de puertos se dibuja con el estado que reporta el router: así se ve de un
  // vistazo cuáles están conectados, cosa que una foto no puede mostrar.
  fotoRouter: string | null = null;
  modelo: ModeloMikrotik | null = null;

  private cargarFicha() {
    const board = this.routerInfo?.resource?.board_name ?? '';
    this.modelo = buscarModelo(board);
    this.fotoRouter = null;
    this.armarPuertos();

    if (!board) return;

    this.svc.getRouterPhoto(board).subscribe({
      next: r => { this.fotoRouter = r?.data?.url ?? null; },
      error: () => { this.fotoRouter = null; },
    });
  }

  /**
   * Los puertos ya resueltos, con su estado y su nota.
   *
   * Se calcula una vez por lectura del router y no en un getter: un getter
   * devuelve un array nuevo en cada ciclo de detección de cambios, Angular lo
   * ve como una lista distinta y recrea los botones sin parar — con eso el
   * clic nunca llegaba a completarse sobre el mismo elemento.
   */
  puertos: Puerto[] = [];
  bloquesDePuertos: { titulo: string; puertos: PuertoVivo[]; filas: number }[] = [];
  puertosArriba = 0;
  puertosDegradados = 0;
  notasDePuertos: { etiqueta: string; nota: string; apagado: boolean }[] = [];

  private armarPuertos() {
    const delModelo = this.modelo?.puertos;

    // Modelo desconocido: se arma con las interfaces físicas que haya.
    this.puertos = delModelo ?? (this.routerInfo?.interfaces ?? [])
      .filter((i: any) => i.type === 'ether')
      .map((i: any, n: number) => ({ nombre: i.name, tipo: 'eth' as const, label: String(n + 1) }));

    const enlaces = this.routerInfo?.enlaces ?? {};

    const vivos: PuertoVivo[] = this.puertos.map(p => {
      const estado = this.estadoPuerto(p);
      const nota = this.comentarioPuerto(p);
      const velocidad = enlaces[p.nombre]?.velocidad ?? null;

      // Un puerto Gigabit conectado a 100 Mbps casi siempre es el cable o el
      // conector: conviene que salte a la vista sin tener que abrir nada.
      const degradado = estado === 'up' && !!velocidad && /^(10|100)Mbps$/i.test(velocidad);

      const detalle = [ESTADOS[estado], velocidad, nota].filter(Boolean).join(' · ');

      return {
        ...p,
        etiqueta: p.label || p.nombre,
        estado,
        nota,
        velocidad,
        degradado,
        sfp: this.esSfp(p),
        titulo: `${p.nombre} · ${detalle}${degradado ? ' — negoció por debajo de lo que soporta' : ''} — clic para ver el detalle`,
      };
    });

    this.puertosDegradados = vivos.filter(p => p.degradado).length;

    this.puertosArriba = vivos.filter(p => p.estado === 'up').length;

    this.notasDePuertos = vivos
      .filter(p => !!p.nota)
      .map(p => ({ etiqueta: p.etiqueta, nota: p.nota, apagado: p.estado !== 'up' }));

    const cobre = vivos.filter(p => !p.sfp);
    const optico = vivos.filter(p => p.sfp);

    this.bloquesDePuertos = [];

    if (cobre.length) {
      this.bloquesDePuertos.push({
        titulo: 'Ethernet',
        puertos: cobre,
        // Los equipos de muchos puertos los traen en dos filas escalonadas.
        filas: this.modelo?.filas === 2 ? 2 : 1,
      });
    }

    if (optico.length) this.bloquesDePuertos.push({ titulo: 'SFP', puertos: optico, filas: 1 });
  }

  /** Para que *ngFor no recree los botones en cada ciclo. */
  porNombre = (_: number, p: { nombre: string }) => p.nombre;
  porTitulo = (_: number, b: { titulo: string }) => b.titulo;
  porEtiqueta = (_: number, n: { etiqueta: string }) => n.etiqueta;

  /** Estado real de un puerto, para pintarlo. */
  estadoPuerto(p: Puerto): EstadoPuerto {
    const i = (this.routerInfo?.interfaces ?? []).find((x: any) => x.name === p.nombre);
    if (!i) return 'na';
    if (String(i.disabled) === 'true') return 'off';
    return String(i.running) === 'true' ? 'up' : 'down';
  }

  /** Lo que el operador anotó en el puerto: "WAN", "TRONCAL 1 UTP". */
  comentarioPuerto(p: Puerto): string {
    const i = (this.routerInfo?.interfaces ?? []).find((x: any) => x.name === p.nombre);
    return (i?.comment ?? '').trim();
  }

  /** Los ópticos se dibujan distinto: más anchos y sin la muesca del RJ45. */
  esSfp(p: Puerto): boolean {
    return p.tipo !== 'eth' && p.tipo !== 'poe';
  }

  /** Bytes a un texto corto. */
  tamano(bytes: any): string {
    const b = Number(bytes ?? 0);
    if (!b) return '—';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), u.length - 1);
    return `${(b / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
  }

  // ── Detalle de un puerto ──────────────────────────────────────────────────
  // Junta en una pantalla lo que en Winbox está repartido en varias: cómo
  // negoció el enlace, el módulo óptico, el tráfico de este momento, las VLAN
  // que salen por ahí y los clientes que cuelgan.
  puertoAbierto: PuertoVivo | null = null;
  detalle: any = null;

  /** El detalle es mucho dato: en pestañas no obliga a bajar sin parar. */
  tabDetalle: 'resumen' | 'red' | 'clientes' | 'diagnostico' = 'resumen';
  cargandoDetalle = false;
  detalleError = '';
  private refrescoDetalle: any = null;

  abrirPuerto(p: PuertoVivo) {
    if (p.estado === 'na') return;

    this.puertoAbierto = p;
    this.detalle = null;
    this.tabDetalle = 'resumen';
    this.detalleError = '';
    this.pedirDetalle();

    // El tráfico en vivo pierde sentido si queda congelado.
    clearInterval(this.refrescoDetalle);
    this.refrescoDetalle = setInterval(() => this.pedirDetalle(true), 5000);
  }

  private pedirDetalle(silencioso = false) {
    const p = this.puertoAbierto;
    if (!p) return;

    if (!silencioso) this.cargandoDetalle = true;

    this.svc.getPortDetail(p.nombre, this.selectedRouterId).subscribe({
      next: r => {
        this.cargandoDetalle = false;
        if (r?.error !== 0) { this.detalleError = r?.message || 'No se pudo consultar el puerto.'; return; }
        this.detalle = r.data;
        this.detalleError = '';
      },
      error: () => {
        this.cargandoDetalle = false;
        if (!silencioso) this.detalleError = 'No se pudo consultar el puerto.';
      },
    });
  }

  cerrarPuerto() {
    clearInterval(this.refrescoDetalle);
    this.refrescoDetalle = null;
    this.puertoAbierto = null;
    this.detalle = null;
  }

  /** Lo que hay que mirar primero: si algo anda mal, se avisa en la pestaña. */
  get hayQueRevisar(): boolean {
    const d = this.detalle;
    return !!(d?.errores?.length || d?.enlace?.sfp?.sin_senal || d?.enlace?.sfp?.falla_tx);
  }

  /** Un enlace que negoció por debajo de lo que soporta suele ser el cable. */
  get enlaceDegradado(): boolean {
    const soportado = this.detalle?.enlace?.soportado ?? [];
    const rate = String(this.detalle?.enlace?.velocidad ?? '');
    return !!rate && soportado.some((s: string) => s.includes('1G')) && !rate.startsWith('1G');
  }

  etiquetaEstado(e: EstadoPuerto): string {
    return { up: 'Con enlace', down: 'Sin enlace', off: 'Deshabilitado', na: '—' }[e];
  }

  /** Bits por segundo a un texto corto. */
  velocidad(bps: any): string {
    const b = Number(bps ?? 0);
    if (!b) return '0 bps';
    const u = ['bps', 'Kbps', 'Mbps', 'Gbps'];
    const i = Math.min(Math.floor(Math.log(b) / Math.log(1000)), u.length - 1);
    return `${(b / Math.pow(1000, i)).toFixed(i >= 2 ? 1 : 0)} ${u[i]}`;
  }

  /** Cuánto del enlace se está usando, para la barra. */
  usoDelEnlace(bps: any): number {
    const capacidad = this.capacidadBps();
    if (!capacidad) return 0;
    return Math.min(100, Math.round((Number(bps ?? 0) / capacidad) * 100));
  }

  private capacidadBps(): number {
    const rate = String(this.detalle?.enlace?.velocidad ?? '');
    const m = rate.match(/^([\d.]+)\s*([GMK])/i);
    if (!m) return 0;
    const mult: any = { G: 1e9, M: 1e6, K: 1e3 };
    return parseFloat(m[1]) * (mult[m[2].toUpperCase()] ?? 1);
  }

  // ── Info ──────────────────────────────────────────────────────────────────

  loadInfo() {
    this.loadingInfo = true;
    this.routerInfo = null;
    this.infoError = '';
    this.svc.getRouterInfo(this.selectedRouterId).subscribe({
      next: r => {
        this.loadingInfo = false;
        // Cuando el router no contesta el backend responde 200 sin datos y con
        // el motivo: antes se tomaba igual y sólo salía un aviso genérico.
        const fallo = !r?.data || r?.error === 1 || r?.error === true || (r?.status !== undefined && r.status !== 0);
        if (fallo) { this.infoError = r?.message || 'No se pudo consultar el router.'; return; }
        this.routerInfo = r.data;
        this.cargarFicha();
      },
      error: e => { this.loadingInfo = false; this.infoError = e?.error?.message || 'No se pudo consultar el router.'; },
    });
  }

  // ── Clients ───────────────────────────────────────────────────────────────

  loadClients() {
    this.loadingClients = true;
    this.selectedIds.clear();
    this.suspendResult = null;
    this.svc.getConnectedClients(this.selectedRouterId).subscribe({
      next: r => {
        this.clients = r.data ?? [];
        this.filterClients();
        this.loadingClients = false;
      },
      error: () => { this.loadingClients = false; },
    });
  }

  filterClients() {
    const q = this.clientSearch.toLowerCase();
    this.filteredClients = !q
      ? [...this.clients]
      : this.clients.filter(c =>
          (c.ip ?? '').includes(q) ||
          (c.comment ?? '').toLowerCase().includes(q) ||
          (c.user_name ?? '').toLowerCase().includes(q) ||
          (c.mac ?? '').toLowerCase().includes(q)
        );
  }

  toggleSelect(client: any) {
    if (!client.user_id) return;
    this.selectedIds.has(client.user_id)
      ? this.selectedIds.delete(client.user_id)
      : this.selectedIds.add(client.user_id);
  }

  allSelected(): boolean {
    const withUser = this.filteredClients.filter(c => c.user_id);
    return withUser.length > 0 && withUser.every(c => this.selectedIds.has(c.user_id));
  }

  toggleSelectAll() {
    const withUser = this.filteredClients.filter(c => c.user_id);
    if (this.allSelected()) {
      withUser.forEach(c => this.selectedIds.delete(c.user_id));
    } else {
      withUser.forEach(c => this.selectedIds.add(c.user_id));
    }
  }

  suspendSelected() {
    if (!this.selectedIds.size) return;
    this.suspending = true;
    this.suspendResult = null;
    this.svc.suspendBulk(Array.from(this.selectedIds), this.selectedRouterId).subscribe({
      next: r => {
        this.suspendResult = r.message;
        this.suspendError = false;
        this.suspending = false;
        this.loadClients();
      },
      error: e => {
        this.suspendResult = 'Error: ' + (e.error?.message ?? 'desconocido');
        this.suspendError = true;
        this.suspending = false;
      },
    });
  }

  // ── Config: CRUD de routers ───────────────────────────────────────────────

  openAddRouter() {
    this.editingRouter = null;
    this.routerForm = { name: '', host: '', user: '', pass: '', port: 8728 };
    this.routerFormMsg = '';
    this.showRouterForm = true;
  }

  openEditRouter(r: any) {
    this.editingRouter = r;
    this.routerForm = { name: r.name ?? '', host: r.host ?? '', user: r.user ?? '', pass: '', port: r.port ?? 8728 };
    this.routerFormMsg = '';
    this.showRouterForm = true;
  }

  saveRouter() {
    if (!this.routerForm.host || !this.routerForm.user) return;
    if (!this.editingRouter && !this.routerForm.pass) return;
    this.savingRouter = true;
    this.routerFormMsg = '';
    this.routerFormError = false;

    const obs = this.editingRouter
      ? this.svc.editRouter(this.editingRouter.id, this.routerForm)
      : this.svc.addRouter(this.routerForm);

    obs.subscribe({
      next: r => {
        this.savingRouter = false;
        // El backend responde { error: 0 } si salió bien (standardApiReponse):
        // se preguntaba por r.status, que no viene, y "Router actualizado"
        // salía en rojo como si hubiera fallado.
        if (r?.error === 0 || r?.status === 0) {
          this.showRouterForm = false;
          this.loadRouters();
        } else {
          this.routerFormMsg = r.message;
          this.routerFormError = true;
        }
      },
      error: e => {
        this.savingRouter = false;
        this.routerFormMsg = e.error?.message ?? 'Error al guardar';
        this.routerFormError = true;
      },
    });
  }

  async confirmDeleteRouter(id: number) {
    if (!await this.dialog.confirm('¿Eliminar este Mikrotik? Esta acción no se puede deshacer.')) return;
    this.deletingRouterId = id;
    this.svc.removeRouter(id).subscribe({
      next: () => { this.deletingRouterId = null; this.loadRouters(); },
      error: () => { this.deletingRouterId = null; },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
    return `${bytes.toFixed(1)} ${units[i]}`;
  }

  cpuPercent(): number {
    return parseInt(this.routerInfo?.resource?.cpu_load ?? '0', 10);
  }

  memPercent(): number {
    const total = this.routerInfo?.resource?.total_memory ?? 0;
    const free  = this.routerInfo?.resource?.free_memory ?? 0;
    if (!total) return 0;
    return Math.round(((total - free) / total) * 100);
  }
}
