import { Component, ElementRef, HostListener, OnInit, ViewChild, inject } from '@angular/core';
import { OltElegida } from '../../shared/olt-elegida';
import { TareasEnSegundoPlanoService } from '../../../../services/tareas-en-segundo-plano.service';
import { CommonModule } from '@angular/common';
import { OltNavComponent } from '../../shared/olt-nav.component';
import { FormsModule } from '@angular/forms';
import { NpSelectComponent, PresentacionSelect } from '../../../../common/np-select/np-select.component';
import { PRESENTACION_OLTS, PRESENTACION_POR_PAGINA, PRESENTACION_REDES, PRESENTACION_TEXTOS, conValor } from '../../../../common/np-select/presentaciones';
import { OltService } from '../../../../services/olt.service';
import { MikrotikService } from '../../../../services/mikrotik.service';
import { ToastService } from '../../../../services/toast.service';
import { DialogService } from '../../../../services/dialog.service';
import { AcsSetupService } from '../../../../services/acs-setup.service';

import { GestionRemotaService } from '../../../../services/gestion-remota.service';

@Component({
  selector: 'app-olt-sin-autorizar',
  standalone: true,
  imports: [CommonModule, FormsModule, NpSelectComponent, OltNavComponent],
  templateUrl: './olt-sin-autorizar.component.html',
  styleUrls: ['../../shared/olt.scss', '../../shared/olt-movil.scss'],
  host: { class: 'np-console' },
})
export class OltSinAutorizarComponent implements OnInit {
  /** Cómo se ven las redes en el selector de VLAN: número de VLAN, segmento y clientes. */
  readonly redes = PRESENTACION_REDES;

  /** Marca, modelo, IP y acceso de cada OLT; en el modelo queda el id, como antes. */
  readonly presOlts = conValor(PRESENTACION_OLTS, o => o.id);
  readonly presPorPagina = PRESENTACION_POR_PAGINA;

  /** Perfiles: el número a la izquierda, el nombre y cuál usa la OLT si no se elige otro. */
  private presPerfil(defecto: () => unknown): PresentacionSelect {
    return {
      valor: p => p?.profile_id,
      etiqueta: p => p?.profile_name || `Perfil ${p?.profile_id}`,
      prefijo: p => (p?.profile_id != null ? String(p.profile_id) : null),
      insignia: p => {
        const d = defecto();
        return d != null && +p?.profile_id === +(d as number) ? { texto: 'Predeterminado', tono: 'info' } : null;
      },
      buscarEn: p => `${p?.profile_id ?? ''} ${p?.profile_name ?? ''}`,
    };
  }

  readonly presPerfilLinea = this.presPerfil(() => this.olts.find(o => o.id === this.selectedOltId)?.ont_lineprofile_id);
  readonly presPerfilServicio = this.presPerfil(() => this.olts.find(o => o.id === this.selectedOltId)?.ont_srvprofile_id);

  // OLT selector
  olts: any[]          = [];
  selectedOltId: number | null = null;
  loadingOlts          = false;

  // ONT list
  onts: any[]          = [];
  loadingOnts          = false;
  lastFetched: Date | null = null;
  page                 = 1;
  perPage              = 15;
  perPageOptions       = [15, 25, 50];

  // Profiles (OLT)
  lineProfiles: any[]  = [];
  srvProfiles: any[]   = [];
  loadingProfiles      = false;
  defaultVlan: number | null = null;

  // MikroTik LAN segments (VLANs)
  lanSegments: any[]   = [];
  loadingSegments      = false;
  selectedSegment: any = null;   // el segmento seleccionado
  availableIps: any[]  = [];
  loadingIps           = false;

  // Register modal
  modal                = false;
  registering          = false;
  selectedOnt: any     = null;
  form = {
    fsp: '',
    serial: '',
    description: '',
    line_profile_id: null as number | null,
    srv_profile_id:  null as number | null,
    vlan: null as number | null,
    onu_type: null as string | null,
  };

  readonly presTextos = PRESENTACION_TEXTOS;

  constructor(
    private oltService: OltService,
    private mikrotikService: MikrotikService,
    private toast: ToastService,
    private dialog: DialogService,
    private acs: AcsSetupService,
  ) {}

  /**
   * Qué admite esta OLT al autorizar. Por defecto, lo de Huawei: serial,
   * service-port y perfil de servicio elegido en el alta.
   */
  capacidades: {
    tecnologia: string; identificador: 'mac' | 'serial'; service_port: boolean;
    perfil_servicio_en_alta: boolean; vlan: string; explicacion_vlan: string | null;
    /** ZTE: los perfiles son de subida (tcont) y de bajada (traffic), y hay tipo de ONU. */
    etiqueta_perfil_linea?: string; etiqueta_perfil_servicio?: string;
    tipos_onu?: string[]; tipo_onu_defecto?: string;
  } = {
    tecnologia: 'gpon', identificador: 'serial', service_port: true,
    perfil_servicio_en_alta: true, vlan: 'service-port', explicacion_vlan: null,
  };

  private readonly capacidadesPorDefecto = { ...this.capacidades };

  private perfilSiExiste(lista: any[], id: number | null | undefined): number | null {
    return id != null && lista.some(p => p.profile_id === id) ? id : null;
  }

  get porMac(): boolean { return this.capacidades.identificador === 'mac'; }
  get conServicePort(): boolean { return this.capacidades.service_port; }

  cargarCapacidades(): void {
    if (!this.selectedOltId) return;

    this.oltService.getCapacidades(this.selectedOltId).subscribe({
      next: (res) => {
        this.capacidades = { ...this.capacidadesPorDefecto, ...(res?.data ?? {}) };
        // Llegaron con el formulario ya abierto: el tipo de ONU por defecto.
        if (this.modal && !this.form.onu_type && this.capacidades.tipos_onu?.length) {
          this.form.onu_type = this.capacidades.tipo_onu_defecto || 'ALL';
        }
      },
      error: () => { this.capacidades = { ...this.capacidadesPorDefecto }; },
    });
  }

  /**
   * Autorización automática por puerto PON. Sólo la muestran los equipos que
   * la permiten (hoy, C-Data EPON): en los demás queda oculta.
   */
  autoAuth: Record<string, { auto: boolean; modo: string; de_fabrica: boolean }> = {};
  autoAuthSoportado = false;
  cargandoAutoAuth  = false;
  cambiandoPuerto: number | null = null;

  /**
   * La lista que dibuja los switches. Se arma sólo cuando llegan datos nuevos
   * y no en un getter: el getter creaba objetos nuevos en cada revisión de la
   * pantalla, Angular volvía a crear los botones cada vez, y si la revisión
   * caía entre apretar y soltar el mouse el navegador no contaba el click.
   */
  puertosAutoAuth: { puerto: number; auto: boolean; de_fabrica: boolean }[] = [];

  /** Los switches se identifican por puerto: así Angular reutiliza el botón. */
  readonly porPuerto = (_: number, p: { puerto: number }) => p.puerto;

  private aplicarAutoAuth(puertos: Record<string, { auto: boolean; modo: string; de_fabrica: boolean }> | null | undefined): void {
    this.autoAuth        = puertos ?? {};
    this.puertosAutoAuth = Object.entries(this.autoAuth)
      .map(([p, v]) => ({ puerto: +p, auto: v.auto, de_fabrica: v.de_fabrica }))
      .sort((a, b) => a.puerto - b.puerto);
  }

  cargarAutoAuth(): void {
    if (!this.selectedOltId) return;

    this.cargandoAutoAuth = true;

    this.oltService.getAutoAutorizacion(this.selectedOltId).subscribe({
      next: (res) => {
        this.cargandoAutoAuth  = false;
        this.autoAuthSoportado = !!res?.data?.soportado;
        this.aplicarAutoAuth(res?.data?.puertos);
      },
      error: () => { this.cargandoAutoAuth = false; this.autoAuthSoportado = false; },
    });
  }

  cambiarAutoAuth(puerto: number, activar: boolean): void {
    if (!this.selectedOltId || this.cambiandoPuerto !== null) return;

    this.cambiandoPuerto = puerto;

    this.oltService.cambiarAutoAutorizacion(this.selectedOltId, puerto, activar).subscribe({
      next: (res) => {
        this.cambiandoPuerto = null;

        // Se muestra lo que la OLT dice que quedó, aunque el cambio haya fallado.
        if (res?.data?.puertos) this.aplicarAutoAuth(res.data.puertos);

        if (res?.status === 0) {
          this.toast.success(res.message);
          this.loadUnauth();
        } else {
          this.toast.error(res?.message || 'La OLT no aplicó el cambio');
        }
      },
      error: (err) => {
        this.cambiandoPuerto = null;
        this.toast.error(err?.error?.message || 'No se pudo cambiar la autorización automática');
      },
    });
  }

  ngOnInit(): void {
    this.loadOlts();
    this.loadLanSegments();
  }

  @HostListener('document:keydown.escape')
  onEsc(): void { this.modal = false; }

  // ── OLT + Profiles ─────────────────────────────────────────────────────

  loadOlts(): void {
    this.loadingOlts = true;
    this.oltService.listOlts().subscribe({
      next: (res) => {
        this.loadingOlts = false;
        this.olts = res.data ?? [];
        // La OLT elegida en cualquier pestaña del módulo (o la primera).
        const elegida = OltElegida.objeto(this.olts);
        if (elegida) {
          this.selectedOltId = elegida.id;
          this.defaultVlan   = elegida.default_vlan ?? null;
          this.loadUnauth();
          this.loadProfiles();
          this.cargarAutoAuth();
          this.cargarCapacidades();
        }
      },
      error: () => { this.loadingOlts = false; },
    });
  }

  onOltChange(): void {
    OltElegida.guardar(this.selectedOltId);
    this.onts = [];
    this.page = 1;
    this.lineProfiles = [];
    this.srvProfiles  = [];
    const olt = this.olts.find(o => o.id === this.selectedOltId);
    this.defaultVlan = olt?.default_vlan ?? null;
    this.aplicarAutoAuth({});
    this.autoAuthSoportado = false;
    if (this.selectedOltId) {
      this.loadUnauth();
      this.loadProfiles();
      this.cargarAutoAuth();
      this.cargarCapacidades();
    }
  }

  loadUnauth(): void {
    if (!this.selectedOltId) return;
    this.loadingOnts = true;
    this.oltService.getUnauthONTs(this.selectedOltId).subscribe({
      next: (res) => {
        this.loadingOnts = false;
        this.onts        = res.data ?? [];
        this.lastFetched = new Date();
      },
      error: (err) => {
        this.loadingOnts = false;
        this.toast.error(err?.error?.message || 'Error al obtener ONTs sin autorizar');
      },
    });
  }

  loadProfiles(): void {
    if (!this.selectedOltId) return;
    this.loadingProfiles = true;
    this.oltService.getProfiles(this.selectedOltId).subscribe({
      next: (res) => {
        this.loadingProfiles = false;
        this.lineProfiles = res.data?.line ?? [];
        this.srvProfiles  = res.data?.srv  ?? [];
      },
      error: () => { this.loadingProfiles = false; },
    });
  }

  // ── MikroTik VLANs ─────────────────────────────────────────────────────

  loadLanSegments(): void {
    this.loadingSegments = true;
    this.mikrotikService.getLanSegments().subscribe({
      next: (res) => {
        this.loadingSegments = false;
        this.lanSegments = res.data ?? [];
      },
      error: () => {
        this.loadingSegments = false;
        // No es un error crítico, puede que no haya MikroTik configurado
      },
    });
  }

  onSegmentChange(): void {
    this.availableIps = [];
    this.form.vlan    = null;

    if (!this.selectedSegment) return;

    // Extraer número de VLAN del nombre de interfaz: "vlan100" → 100
    const match = String(this.selectedSegment.names).match(/\d+/);
    this.form.vlan = match ? parseInt(match[0], 10) : null;

    // Cargar IPs disponibles en esa VLAN
    this.loadingIps = true;
    this.mikrotikService.getIpAvalibles(this.selectedSegment.names).subscribe({
      next: (res) => {
        this.loadingIps = false;
        this.availableIps = res.data?.ips ?? [];
      },
      error: () => { this.loadingIps = false; },
    });
  }

  segmentLabel(seg: any): string {
    return `${seg.names}  —  ${seg.network}  (gw: ${seg.gateway})`;
  }

  // ── Pagination ─────────────────────────────────────────────────────────

  get pagedOnts(): any[] {
    const start = (this.page - 1) * this.perPage;
    return this.onts.slice(start, start + this.perPage);
  }

  get totalPages(): number { return Math.max(1, Math.ceil(this.onts.length / this.perPage)); }

  get pageNumbers(): number[] {
    const delta = 2;
    const range: number[] = [];
    for (let i = Math.max(1, this.page - delta); i <= Math.min(this.totalPages, this.page + delta); i++) range.push(i);
    return range;
  }

  prevPage(): void { if (this.page > 1) this.page--; }
  nextPage(): void { if (this.page < this.totalPages) this.page++; }
  goPage(p: number): void { this.page = p; }
  changePerPage(): void { this.page = 1; }
  minVal(a: number, b: number): number { return Math.min(a, b); }

  // ── Register ───────────────────────────────────────────────────────────

  openRegister(ont: any): void {
    this.selectedOnt     = ont;
    this.selectedSegment = null;
    this.availableIps    = [];
    const olt = this.olts.find(o => o.id === this.selectedOltId);
    this.form = {
      fsp:             ont.fsp    ?? '',
      serial:          ont.serial ?? '',
      description:     '',
      // El de la OLT sólo si existe en ella: una ZTE traía el «10» de Huawei.
      line_profile_id: this.perfilSiExiste(this.lineProfiles, olt?.ont_lineprofile_id) ?? (this.lineProfiles[0]?.profile_id ?? null),
      srv_profile_id:  this.perfilSiExiste(this.srvProfiles, olt?.ont_srvprofile_id)  ?? (this.srvProfiles[0]?.profile_id  ?? null),
      vlan:            this.defaultVlan,
      onu_type:        this.capacidades.tipos_onu?.length ? (this.capacidades.tipo_onu_defecto || 'ALL') : null,
    };
    this.modal = true;
    this.pasos = [];
    this.clienteElegido = null;
    this.clienteElegidoId = null;
    this.buscaCliente = '';
    this.mostrarLista = false;
    this.verificarSiYaExiste();
    this.cargarClientes();
    this.wifi = { ssid: '', clave: '' };
    this.cargarAprov();
  }

  /** La dirección del TR-069, para dejársela cargada al equipo recién instalado. */
  urlAcs = '';

  private cargarUrlAcs(): void {
    if (this.urlAcs) return;
    this.acs.estado().subscribe({ next: (r: any) => this.urlAcs = r?.data?.url_para_onts ?? '' });
  }

  async confirmRegister(): Promise<void> {
    if (!this.selectedOltId || !this.form.fsp) return;

    // Autorizar sin cliente es lo que dejó cientos de ONT sueltas: se puede,
    // pero avisando, porque después no se sabe de quién es cada equipo.
    if (!this.clienteElegido) {
      const seguir = await this.dialog.confirm(
        'Vas a autorizar la ONT sin cliente. No vas a ver su equipo en la ficha ni el cliente su WiFi en el portal, '
        + 'y después hay que vincularla a mano. ¿Seguir igual?',
        { okLabel: 'Autorizar sin cliente' },
      );

      if (!seguir) return;
    }

    const aprovisionar = this.aprov?.aprovisionar;
    const claveWifi = this.wifi.clave.trim();

    if (aprovisionar && claveWifi && (claveWifi.length < 8 || claveWifi.length > 63)) {
      this.toast.error('La clave del WiFi debe tener entre 8 y 63 caracteres (o dejala vacía para generarla).');
      return;
    }

    this.registering = true;
    this.oltService.registerONT(this.selectedOltId, {
      fsp:             this.form.fsp,
      serial:          this.form.serial      || undefined,
      description:     this.form.description || undefined,
      line_profile_id: this.form.line_profile_id,
      srv_profile_id:  this.form.srv_profile_id,
      vlan:            this.form.vlan,
      onu_type:        this.form.onu_type || undefined,
      user_data_id:    this.clienteElegido?.id ?? undefined,
      // La red elegida (gateway y máscara) arma la IP fija del cliente en el equipo.
      aprovisionar:    aprovisionar ? {
        gateway:    this.selectedSegment?.gateway ?? null,
        mascara:    this.selectedSegment?.mask ?? null,
        wifi_ssid:  this.wifi.ssid.trim() || null,
        wifi_clave: claveWifi || null,
      } : undefined,
    }).subscribe({
      // El backend responde 200 aunque la OLT haya rechazado: el resultado
      // viene dentro. Antes se mostraba en verde el texto del error.
      next: (res) => this.trasProvisionar(res),
      error: (err) => {
        this.registering = false;
        this.toast.error(err?.error?.message || 'No se pudo contactar la OLT.');
      },
    });
  }

  private tareas = inject(TareasEnSegundoPlanoService);
  private gestion = inject(GestionRemotaService);

  /** Si la empresa aprovisiona al autorizar: entonces el alta pide el WiFi. */
  aprov: any = null;
  wifi = { ssid: '', clave: '' };

  private cargarAprov(): void {
    this.gestion.aprovisionamiento().subscribe({
      next: (r: any) => this.aprov = r?.error === 0 ? r.data.ajustes : null,
      error: () => this.aprov = null,
    });
  }

  private trasProvisionar(res: any): void {
    this.registering = false;
    this.pasos = res?.data?.pasos ?? [];
    this.ontRegistrada = res?.data ?? null;

    // El acceso remoto del equipo nuevo sigue en segundo plano: a la ventana.
    const acceso: any = this.pasos.find((p: any) => p?.tarea);
    if (acceso) {
      this.tareas.seguir(acceso.tarea, `Dando acceso remoto · ${this.form.description || this.form.serial} (${this.form.fsp})`, 'dar_acceso');
    }

    // El aprovisionamiento también: corre al minuto y se ve en la ventana.
    const aprov: any = this.pasos.find((p: any) => p?.aprovisionamiento);
    if (aprov) {
      this.tareas.seguirAprovisionamiento(Number(aprov.aprovisionamiento), `Aprovisionando · ${this.form.description || this.form.serial} (${this.form.fsp})`);
    }

    if (res?.error !== 0) {
      this.toast.error(res?.message || 'La OLT no autorizó la ONT.');
      return;
    }

    this.toast.success(res.message || 'ONT autorizada.');
    this.loadUnauth();
    this.cargarUrlAcs();

    // Si algún paso quedó pendiente, el modal se queda abierto para poder
    // reintentarlo: cerrarlo daría por terminado algo que no lo está.
    if (!this.pasos.some(p => !p.ok && !p.omitido)) this.modal = false;
  }

  copiado = '';

  async copiar(texto: string, que: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(texto);
      this.copiado = que;
      setTimeout(() => { if (this.copiado === que) this.copiado = ''; }, 1500);
    } catch { }
  }

  /** Lo que devolvió el alta, para poder reintentar un paso suelto. */
  ontRegistrada: any = null;
  completando = false;

  /**
   * ¿Falló el paso de VLAN? En Huawei es "Crear el service-port"; en los
   * equipos sin service-port (C-Data EPON) es "VLAN … en el puerto PON …".
   */
  get faltaServicePort(): boolean {
    return this.pasos.some(p => {
      const nombre = p.paso?.toLowerCase() ?? '';
      return !p.ok && (nombre.includes('service-port') || nombre.includes('puerto pon'));
    });
  }

  /**
   * Reintenta sólo el service-port.
   *
   * Es el paso que más falla, y sin él el cliente conecta pero no navega. No
   * hace falta volver a autorizar: la ONT ya está.
   */
  completarServicePort(): void {
    if (!this.selectedOltId || !this.ontRegistrada?.ont_id) return;

    this.completando = true;

    this.oltService.completarServicePort(this.selectedOltId, {
      fsp:         this.ontRegistrada.fsp ?? this.form.fsp,
      ont_id:      this.ontRegistrada.ont_id,
      vlan:        this.form.vlan,
      description: this.form.description,
    }).subscribe({
      next: (res) => {
        this.completando = false;

        if (res?.error !== 0) { this.toast.error(res?.message || 'No se pudo crear el service-port.'); return; }

        this.toast.success(res.message || 'Service-port creado.');

        // Se marca el paso como resuelto en vez de rehacer todo el listado.
        this.pasos = this.pasos.map(p =>
          p.paso?.toLowerCase().includes('service-port')
            ? { ...p, ok: true, detalle: res.message }
            : p);

        this.modal = false;
        this.loadUnauth();
      },
      error: () => {
        this.completando = false;
        this.toast.error('No se pudo contactar la OLT.');
      },
    });
  }

  // ── A quién se le pone esta ONT ───────────────────────────────────────────
  // Se listan sólo los clientes que todavía no tienen una ONT: así no se
  // vincula por error a alguien que ya tiene la suya. El nombre sigue viajando
  // a la OLT como descripción; el vínculo se guarda del lado nuestro para
  // saber después qué puerto atiende a cada cliente.
  @ViewChild('buscador') buscador?: ElementRef<HTMLInputElement>;

  clientes: any[] = [];
  clienteElegido: any = null;
  clienteElegidoId: number | null = null;
  buscaCliente = '';
  cargandoClientes = false;

  /**
   * Se traen todos de una vez y se filtran acá.
   *
   * Son unos cientos: pedirlos al servidor en cada tecla haría esperar por
   * algo que ya está en memoria.
   */
  cargarClientes(): void {
    if (!this.selectedOltId) return;

    this.cargandoClientes = true;

    this.oltService.clientesSinOnt(this.selectedOltId).subscribe({
      next: (res) => {
        this.cargandoClientes = false;
        this.clientes = res?.data ?? [];
      },
      error: () => { this.cargandoClientes = false; this.clientes = []; },
    });
  }

  get clientesFiltrados(): any[] {
    const t = this.buscaCliente.trim().toLowerCase();

    if (!t) return this.clientes;

    return this.clientes.filter(c =>
      (c.nombre || '').toLowerCase().includes(t) ||
      (c.dni || '').toLowerCase().includes(t) ||
      (c.direccion || '').toLowerCase().includes(t));
  }

  /** Lo que se lee en cada opción del desplegable. */
  etiquetaCliente(c: any): string {
    const partes = [c.nombre, c.dni ? 'cc ' + c.dni : null, c.plan].filter(Boolean);

    return partes.join(' · ') + (c.tiene_ont ? '  — ya tiene ONT' : '');
  }

  /** La lista sólo aparece mientras se escribe, como en el alta de tickets. */
  mostrarLista = false;

  elegirCliente(c: any): void {
    this.clienteElegido = c;
    this.clienteElegidoId = c.id;
    this.mostrarLista = false;
    this.buscaCliente = '';

    // La OLT recibe el nombre como descripción, que es lo que se ve en ella.
    this.form.description = c.nombre;
  }

  /** Cerrar el desplegable al hacer clic en cualquier otro lado. */
  @HostListener('document:click', ['$event'])
  clicFuera(e: MouseEvent): void {
    if (!this.mostrarLista) return;

    if (!(e.target as HTMLElement)?.closest('.olt-busca-cliente')) this.mostrarLista = false;
  }

  quitarCliente(): void {
    this.clienteElegido = null;
    this.clienteElegidoId = null;
    this.buscaCliente = '';
    this.form.description = '';
  }

  // ── Ya autorizada en otro puerto ──────────────────────────────────────────
  // Una ONT sólo puede estar en un puerto. Cuando se cambia de fibra queda en
  // el anterior, y la OLT rechaza el alta sin decir por qué: por eso se
  // pregunta antes y se ofrece moverla.
  yaExiste: any = null;
  buscandoOnt = false;
  moviendo = false;

  private verificarSiYaExiste(): void {
    const serial = (this.form.serial || '').trim();
    this.yaExiste = null;

    if (!serial || !this.selectedOltId) return;

    this.buscandoOnt = true;

    this.oltService.buscarOnt(this.selectedOltId, serial).subscribe({
      next: (res) => {
        this.buscandoOnt = false;
        const d = res?.data;

        // Sólo interesa si está en OTRO puerto: en el mismo no hay conflicto.
        if (d?.encontrada && d.fsp !== this.form.fsp) this.yaExiste = d;
      },
      error: () => { this.buscandoOnt = false; },
    });
  }

  async moverOnt(): Promise<void> {
    if (!this.selectedOltId || !this.yaExiste) return;

    const ok = await this.dialog.confirm(
      `La ONT está autorizada en ${this.yaExiste.fsp} (ONT ID ${this.yaExiste.ont_id}). ` +
      `Se va a quitar de ahí y autorizar en ${this.form.fsp}. El cliente pierde el servicio un momento. ¿Confirmás?`,
      { okLabel: 'Mover la ONT' },
    );

    if (!ok) return;

    this.moviendo = true;
    this.registering = true;

    this.oltService.moverOnt(this.selectedOltId, {
      fsp:             this.form.fsp,
      serial:          this.form.serial || undefined,
      description:     this.form.description || undefined,
      line_profile_id: this.form.line_profile_id,
      srv_profile_id:  this.form.srv_profile_id,
      vlan:            this.form.vlan,
      onu_type:        this.form.onu_type || undefined,
      user_data_id:    this.clienteElegido?.id ?? undefined,
    }).subscribe({
      next: (res) => {
        this.moviendo = false;
        this.pasos = res?.data?.pasos ?? [];
        this.trasProvisionar(res);
        if (res?.error === 0) this.yaExiste = null;
      },
      error: (err) => {
        this.moviendo = false;
        this.registering = false;
        this.toast.error(err?.error?.message || 'No se pudo mover la ONT.');
      },
    });
  }

  /** Qué se hizo y qué no, cuando la operación tiene varios pasos. */
  /** omitido: el paso no se hizo a propósito, no es un fallo. */
  pasos: { paso: string; ok: boolean; detalle?: string; omitido?: boolean }[] = [];

  selectedOltName(): string {
    return this.olts.find(o => o.id === this.selectedOltId)?.name ?? '';
  }
}
