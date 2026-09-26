import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { InstallationService } from '../../services/installation.service';
import { OltService } from '../../services/olt.service';
import { UserService } from '../../services/user.service';
import { NpSelectComponent, PresentacionSelect } from '../../common/np-select/np-select.component';
import {
  OpcionesDeIps, PRESENTACION_IPS_ASIGNABLES, PRESENTACION_OLTS, PRESENTACION_PLANES,
  PRESENTACION_REDES, PRESENTACION_ROUTERS, PRESENTACION_SEGMENTOS, PRESENTACION_TEXTOS,
  agruparRedesPorInterfaz, conValor,
} from '../../common/np-select/presentaciones';

/**
 * Tomar el pedido de una instalación.
 *
 * Es el mismo alta de cliente de siempre, sólo que se guarda para que el
 * técnico la ejecute desde la calle: los mismos selectores del panel —el plan
 * con su velocidad y precio, las redes del router con sus clientes, las IP
 * libres, los perfiles PPP del MikroTik y los perfiles de línea de la OLT—,
 * para que nada se escriba a mano ni haya que llamar a la oficina.
 *
 * Va en cinco pasos y no se pasa de uno sin lo obligatorio de ese paso: lo que
 * falte aquí lo descubre el técnico en la casa del cliente, y ahí ya es tarde.
 */
@Component({
  selector: 'app-installation-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, NpSelectComponent],
  templateUrl: './installation-form.component.html',
  styleUrl: './installation-form.component.scss',
  host: { class: 'np-console' },
})
export class InstallationFormComponent implements OnInit {
  isSaving = false;
  errorMsg = '';
  successMsg = '';

  // ── Los selectores, con la misma presentación que el resto del panel ──────
  readonly presPlanes = conValor(PRESENTACION_PLANES, p => String(p.id));
  readonly presRouters = conValor(PRESENTACION_ROUTERS, r => r.id);
  readonly presOlts = conValor(PRESENTACION_OLTS, o => o.id);
  readonly presRedes = PRESENTACION_REDES;
  readonly presSegmentos = PRESENTACION_SEGMENTOS;
  readonly presIps = PRESENTACION_IPS_ASIGNABLES;
  readonly presTextos = PRESENTACION_TEXTOS;
  readonly opcionesIp = new OpcionesDeIps();

  readonly presCortes: PresentacionSelect = {
    valor: d => String(d?.id),
    etiqueta: d => String(d?.names ?? '').split(/\s[–-]\s/)[0],
    detalle: d => String(d?.names ?? '').split(/\s[–-]\s/).slice(1).join(' – ') || null,
    buscarEn: d => String(d?.names ?? ''),
  };

  /** Perfiles PPP del router: velocidad, de qué rango reparte y cuántos lo usan. */
  readonly presPerfilesPpp: PresentacionSelect = {
    valor: p => p?.nombre,
    etiqueta: p => p?.nombre ?? '',
    detalle: p => [p?.velocidad ? `Velocidad ${p.velocidad}` : null, p?.pool ? `Reparte de ${p.pool}` : null].filter(Boolean).join(' · ') || null,
    insignia: p => (p?.del_sistema ? { texto: 'Del sistema', tono: 'neutral' } : null),
    atenuada: p => !!p?.del_sistema,
    buscarEn: p => [p?.nombre, p?.velocidad, p?.pool].filter(Boolean).join(' '),
  };

  /** Perfiles de la OLT: el número a la izquierda y cuál usa si no se elige otro. */
  private presPerfilOlt(defecto: () => unknown): PresentacionSelect {
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

  readonly presPerfilLinea = this.presPerfilOlt(() => this.oltElegida?.ont_lineprofile_id);
  readonly presPerfilServicio = this.presPerfilOlt(() => this.oltElegida?.ont_srvprofile_id);

  // ── Catálogos ─────────────────────────────────────────────────────────────
  technicians: any[] = [];
  plans: any[] = [];
  cortes: any[] = [];
  routers: any[] = [];
  olts: any[] = [];

  interfaces: any[] = [];          // las redes del router, agrupadas por interfaz
  segments: any[] = [];            // las redes de la VLAN elegida, si hay más de una
  ips: any[] = [];                 // las IP libres del segmento
  perfilesPpp: any[] = [];
  lineProfiles: any[] = [];
  srvProfiles: any[] = [];

  cargandoRouters = false;
  cargandoRedes = false;
  cargandoIps = false;
  cargandoPerfilesPpp = false;
  cargandoPerfilesOlt = false;

  avisoRedes = '';
  avisoIps = '';
  avisoPpp = '';

  /** Lo que la OLT elegida admite: cómo se llaman sus perfiles, si hay tipo de ONU. */
  capacidades: any = { etiqueta_perfil_linea: 'Perfil de línea', etiqueta_perfil_servicio: 'Perfil de servicio', perfil_servicio_en_alta: true };

  // Lo elegido en los selectores que no van derecho al formulario
  vlanElegida: any = null;
  segElegido: any = null;

  form = this.emptyForm();

  readonly PASOS = [
    { n: 1, titulo: 'Cliente',              corto: 'Cliente',  ayuda: 'Los datos de quien pidió el servicio. Se da de alta como cliente cuando el técnico termine, no ahora.' },
    { n: 2, titulo: 'Servicio',             corto: 'Servicio', ayuda: 'Qué se le vende y cuándo se le cobra.' },
    { n: 3, titulo: 'Conexión',             corto: 'Conexión', ayuda: 'Cómo entra a la red. Sale del router, igual que en el alta de clientes.' },
    { n: 4, titulo: 'Equipo y WiFi',        corto: 'Equipo',   ayuda: 'Con qué perfiles se autoriza la ONT y cómo queda la casa.' },
    { n: 5, titulo: 'Visita y técnicos',    corto: 'Visita',   ayuda: 'Cuándo se va, quién la hace y cuánto se cobra.' },
  ];

  paso = 1;

  constructor(
    private svc: InstallationService,
    private userSvc: UserService,
    private oltSvc: OltService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.cargarCatalogos();
  }

  emptyForm() {
    return {
      user_data_id: '',
      client_nombres: '',
      client_apellidos: '',
      client_dni: '',
      client_phone: '',
      client_email: '',
      address: '',
      neighborhood: '',

      internet_plan_id: '',
      grupo_facturacion: '1',

      connection_type: 'pppoe',
      router_id: null as number | null,
      pppoe_user: '',
      pppoe_password: '',
      pppoe_profile: '',
      ip_asignada: '',
      vlan: null as number | null,

      olt_id: null as number | null,
      line_profile_id: null as number | null,
      srv_profile_id: null as number | null,
      onu_type: null as string | null,

      wifi_ssid: '',
      wifi_password: '',

      scheduled_date: '',
      scheduled_time: '09:00',
      installation_cost: '0',
      technician_ids: [] as number[],
      commission_amount: '0',
      observations: '',
    };
  }

  cargarCatalogos(): void {
    this.svc.getTechnicians().subscribe(r => this.technicians = r?.data || r || []);
    // El plan entero: el selector muestra velocidad, tipo y precio.
    this.userSvc.getInternetPlanAll().subscribe((r: any) => this.plans = r?.data ?? []);
    this.userSvc.getDataCorteAll().subscribe((r: any) =>
      this.cortes = (r?.data ?? []).map((e: any) => ({ id: e.id, names: e.data_cortes })));

    this.cargandoRouters = true;
    this.userSvc.getRouters().subscribe({
      next: (r: any) => {
        this.cargandoRouters = false;
        this.routers = r?.data ?? [];
        // Con un router solo no hay nada que elegir.
        if (this.routers.length === 1) {
          this.form.router_id = this.routers[0].id;
          this.alCambiarRouter();
        }
      },
      error: () => { this.cargandoRouters = false; },
    });

    this.oltSvc.listOlts().subscribe({
      next: (r: any) => {
        this.olts = r?.data ?? [];
        if (this.olts.length === 1) {
          this.form.olt_id = this.olts[0].id;
          this.alCambiarOlt();
        }
      },
      error: () => { /* sin OLT se puede tomar el pedido igual */ },
    });
  }

  get oltElegida(): any {
    return this.olts.find(o => o.id === this.form.olt_id);
  }

  // ── Router, VLAN, segmento, IP: el mismo camino que el alta de clientes ───

  alCambiarRouter(): void {
    this.vlanElegida = null;
    this.segElegido = null;
    this.segments = [];
    this.ips = [];
    this.form.vlan = null;
    this.form.ip_asignada = '';
    this.avisoIps = '';
    this.cargarRedes();
    if (this.esPppoe) this.cargarPerfilesPpp();
  }

  cargarRedes(): void {
    this.cargandoRedes = true;
    this.avisoRedes = '';

    this.userSvc.getneighborhoodAll(this.form.router_id, false).subscribe({
      next: (r: any) => {
        this.cargandoRedes = false;
        // Llega como objeto, no como lista: sin Object.values no se puede recorrer.
        this.interfaces = r?.error === 0 && r.data ? agruparRedesPorInterfaz(Object.values(r.data)) : [];

        if (!this.interfaces.length) {
          this.avisoRedes = r?.message || 'El router no devolvió VLAN.';
        }
      },
      error: () => {
        this.cargandoRedes = false;
        this.interfaces = [];
        this.avisoRedes = 'No se pudo conectar con el router. Verifique que esté en línea y reintente.';
      },
    });
  }

  alCambiarVlan(iface: any): void {
    this.vlanElegida = iface;
    this.segments = iface ? [iface] : [];
    this.segElegido = this.segments[0] ?? null;
    this.ips = [];
    this.form.ip_asignada = '';

    // El número de VLAN sale del nombre de la interfaz: "vlan100" → 100. Es lo
    // que necesita la OLT para el service port.
    const m = String(iface?.names ?? '').match(/\d+/);
    this.form.vlan = m ? parseInt(m[0], 10) : (iface?.vlan_id ?? null);

    if (!this.esPppoe) this.cargarIps();
  }

  alCambiarSegmento(seg: any): void {
    this.segElegido = seg;
    this.form.ip_asignada = '';
    this.cargarIps();
  }

  cargarIps(): void {
    if (!this.vlanElegida) { this.ips = []; return; }

    this.cargandoIps = true;
    this.avisoIps = '';

    const segmento = this.segments.length > 1 ? (this.segElegido?.network ?? null) : null;

    this.userSvc.getIpzonebyZone(this.vlanElegida.names, segmento, this.form.router_id, null).subscribe({
      next: (r: any) => {
        this.cargandoIps = false;

        if (r?.error !== 0) {
          this.ips = [];
          this.avisoIps = r?.message || 'El router no respondió. Reintente en un momento.';
          return;
        }

        this.ips = this.opcionesIp.recordar((r?.data?.ips ?? []).map((e: any) => ({ id: e.ip, names: e.ip })), r?.data?.ocupadas);

        // Cuando la VLAN tiene varias redes, se elige entre ellas.
        const redes: any[] = r?.data?.redes ?? [];
        if (redes.length > 1) {
          this.segments = redes.map(x => ({ ...x, names: this.vlanElegida.names, vlan_id: this.vlanElegida.vlan_id }));
          if (!this.segElegido) this.segElegido = this.segments.find(x => x.elegida) ?? this.segments[0];
        }

        if (!this.ips.length) this.avisoIps = 'No quedan IP libres en este segmento.';
      },
      error: () => {
        this.cargandoIps = false;
        this.ips = [];
        this.avisoIps = 'No se pudo conectar con el router.';
      },
    });
  }

  cargarPerfilesPpp(): void {
    this.cargandoPerfilesPpp = true;
    this.avisoPpp = '';

    this.userSvc.getPppoe(this.form.router_id).subscribe({
      next: (r: any) => {
        this.cargandoPerfilesPpp = false;

        if (r?.error !== 0) { this.avisoPpp = r?.message || 'No se pudo leer el router.'; return; }

        this.perfilesPpp = r.data?.estado?.perfiles ?? [];

        if (!this.perfilesPpp.length) {
          this.avisoPpp = 'El router no tiene perfiles PPP configurados.';
          return;
        }

        if (!this.form.pppoe_profile) this.form.pppoe_profile = this.perfilesPpp[0].nombre;

        // Se puede tomar el pedido igual, pero conviene saberlo antes de que el
        // técnico esté en la casa y el cliente no pueda autenticarse.
        if (!r.data?.estado?.disponible) {
          this.avisoPpp = 'El router no tiene un servidor PPPoE levantado. Se puede tomar el pedido, pero el cliente no va a poder conectarse hasta que lo configures.';
        }
      },
      error: () => { this.cargandoPerfilesPpp = false; this.avisoPpp = 'No se pudo leer la configuración PPPoE del router.'; },
    });
  }

  cambiarTipoConexion(tipo: 'static' | 'pppoe'): void {
    this.form.connection_type = tipo;
    this.form.ip_asignada = '';

    if (tipo !== 'pppoe') return;

    // El usuario por defecto es el documento: es con lo que se lo encuentra
    // después, igual que el comentario del ARP.
    if (!this.form.pppoe_user && this.form.client_dni) {
      this.form.pppoe_user = String(this.form.client_dni).trim();
    }
    if (!this.perfilesPpp.length) this.cargarPerfilesPpp();
  }

  // ── La OLT y sus perfiles ─────────────────────────────────────────────────

  alCambiarOlt(): void {
    this.lineProfiles = [];
    this.srvProfiles = [];
    this.form.line_profile_id = null;
    this.form.srv_profile_id = null;
    this.form.onu_type = null;

    if (!this.form.olt_id) return;

    this.oltSvc.getCapacidades(this.form.olt_id).subscribe({
      next: (r: any) => {
        this.capacidades = { ...this.capacidades, ...(r?.data ?? {}) };
        if (this.capacidades.tipos_onu?.length) {
          this.form.onu_type = this.capacidades.tipo_onu_defecto || 'ALL';
        }
      },
      error: () => { /* con las etiquetas por defecto alcanza */ },
    });

    this.cargandoPerfilesOlt = true;
    this.oltSvc.getProfiles(this.form.olt_id).subscribe({
      next: (r: any) => {
        this.cargandoPerfilesOlt = false;
        this.lineProfiles = r?.data?.line ?? [];
        this.srvProfiles = r?.data?.srv ?? [];

        // El que la OLT trae por defecto, si sigue existiendo; si no, el primero.
        const olt = this.oltElegida;
        this.form.line_profile_id = this.existe(this.lineProfiles, olt?.ont_lineprofile_id) ?? (this.lineProfiles[0]?.profile_id ?? null);
        this.form.srv_profile_id = this.existe(this.srvProfiles, olt?.ont_srvprofile_id) ?? (this.srvProfiles[0]?.profile_id ?? null);
      },
      error: () => { this.cargandoPerfilesOlt = false; },
    });
  }

  private existe(lista: any[], id: number | null | undefined): number | null {
    return id != null && lista.some(p => p.profile_id === id) ? id : null;
  }

  // ── Claves ────────────────────────────────────────────────────────────────

  /**
   * Una clave que el cliente no tenga que inventar.
   *
   * Sin las letras y números que se confunden al dictarla por teléfono: ni ele
   * minúscula, ni o, ni cero, ni uno. La misma que usa el alta de clientes.
   */
  private claveNueva(largo = 10): string {
    const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
    let clave = '';
    for (let i = 0; i < largo; i++) clave += abc[Math.floor(Math.random() * abc.length)];
    return clave;
  }

  generarClavePppoe(): void { this.form.pppoe_password = this.claveNueva(); }

  /** Del WiFi: 10 caracteres, que el equipo acepta y el cliente puede dictar. */
  generarClaveWifi(): void { this.form.wifi_password = this.claveNueva(); }

  // ── Reglas de los campos ──────────────────────────────────────────────────

  get esPppoe(): boolean { return this.form.connection_type === 'pppoe'; }

  /**
   * La clave del WiFi tiene que entrar en el equipo.
   *
   * La OLT y las ONT rechazan la ñ, los acentos y varios signos, y toda la
   * orden se manda junta: una clave con ñ hace fallar también el nombre de la
   * red. Mejor que se sepa aquí y no con el técnico en la casa del cliente.
   */
  get problemaDeLaClaveWifi(): string {
    const c = this.form.wifi_password ?? '';
    if (!c) return '';
    if (c.length < 8) return 'Al menos 8 caracteres.';
    if (!/^[A-Za-z0-9\-_.@#$%&*+=!?():,]+$/.test(c)) return 'Sin ñ, sin tildes y sin espacios: el equipo la rechaza.';
    return '';
  }

  get problemaDelNombreWifi(): string {
    const n = this.form.wifi_ssid ?? '';
    if (!n) return '';
    if (!/^[A-Za-z0-9\-_. ]+$/.test(n)) return 'Sin ñ ni tildes: el equipo lo rechaza.';
    return '';
  }

  // ── Los pasos ─────────────────────────────────────────────────────────────

  get pasoActual() { return this.PASOS[this.paso - 1]; }
  get esElUltimo(): boolean { return this.paso === this.PASOS.length; }

  /**
   * Qué le falta a un paso, en palabras.
   *
   * Sirve para pintar el paso como incompleto en la barra de arriba y para
   * decir qué es lo que falta, en vez del «complete los campos requeridos».
   */
  faltaEnElPaso(n: number): string {
    const f = this.form;
    const falta: string[] = [];

    if (n === 1) {
      if (!f.client_nombres?.trim()) falta.push('el nombre');
      if (!f.client_apellidos?.trim()) falta.push('los apellidos');
      if (!f.client_dni?.trim()) falta.push('el documento');
      if (!f.client_phone?.trim()) falta.push('el teléfono');
      if (!f.address?.trim()) falta.push('la dirección');
    }

    if (n === 2) {
      if (!f.internet_plan_id) falta.push('el plan');
      if (!f.grupo_facturacion) falta.push('el día de corte');
    }

    if (n === 3) {
      if (this.routers.length && !f.router_id) falta.push('el router');
      if (!f.vlan) falta.push('la VLAN');
      if (this.esPppoe) {
        if (!f.pppoe_user?.trim()) falta.push('el usuario PPPoE');
        if (this.perfilesPpp.length && !f.pppoe_profile) falta.push('el perfil PPP');
      } else if (!f.ip_asignada) {
        falta.push('la IP');
      }
    }

    if (n === 4) {
      // Sin OLT el técnico no puede autorizar el equipo desde la calle.
      if (this.olts.length && !f.olt_id) falta.push('la OLT');
      if (this.problemaDelNombreWifi) falta.push('arreglar el nombre del WiFi');
      if (this.problemaDeLaClaveWifi) falta.push('arreglar la clave del WiFi');
    }

    if (n === 5) {
      if (!f.scheduled_date) falta.push('la fecha');
      if (!f.scheduled_time) falta.push('la hora');
    }

    return falta.length ? 'Falta ' + falta.join(', ') + '.' : '';
  }

  pasoCompleto(n: number): boolean { return !this.faltaEnElPaso(n); }

  /** Se puede ir a un paso si los anteriores están listos. */
  irA(n: number): void {
    if (n === this.paso) return;

    for (let i = 1; i < n; i++) {
      if (!this.pasoCompleto(i)) {
        this.paso = i;
        this.errorMsg = this.faltaEnElPaso(i);
        return;
      }
    }

    this.errorMsg = '';
    this.paso = n;
  }

  siguiente(): void {
    const falta = this.faltaEnElPaso(this.paso);

    if (falta) { this.errorMsg = falta; return; }

    this.errorMsg = '';
    if (!this.esElUltimo) this.paso++;
  }

  atras(): void {
    this.errorMsg = '';
    if (this.paso > 1) this.paso--;
  }

  // ── Técnicos y comisión ───────────────────────────────────────────────────

  toggleTechnician(id: number): void {
    if (!this.form.technician_ids) this.form.technician_ids = [];

    const idx = this.form.technician_ids.indexOf(id);
    if (idx > -1) this.form.technician_ids.splice(idx, 1);
    else this.form.technician_ids.push(id);
  }

  get totalCommission(): number { return parseFloat(this.form.commission_amount) || 0; }

  onCommissionChange(event: any): void { this.form.commission_amount = event.target.value; }

  // ── El resumen del último paso ────────────────────────────────────────────

  get nombreCompleto(): string {
    return [this.form.client_nombres, this.form.client_apellidos].map(x => (x ?? '').trim()).filter(Boolean).join(' ');
  }

  get nombreDelPlan(): string {
    const p = this.plans.find(x => String(x.id) === String(this.form.internet_plan_id));
    return p ? (p.plan_name ?? p.names ?? '—') : '—';
  }

  get nombreDelCorte(): string {
    const c = this.cortes.find(x => String(x.id) === String(this.form.grupo_facturacion));
    return c ? c.names : '—';
  }

  get nombreDeLaOlt(): string {
    return this.oltElegida?.name ?? '—';
  }

  get nombreDelRouter(): string {
    const r = this.routers.find(x => x.id === this.form.router_id);
    return r ? (r.name || r.host || `Router ${r.id}`) : '—';
  }

  // ── Guardar ───────────────────────────────────────────────────────────────

  save(): void {
    // El primero que esté incompleto: se salta a ese paso, en vez de avisar
    // «faltan campos» sin decir dónde.
    for (const p of this.PASOS) {
      const falta = this.faltaEnElPaso(p.n);

      if (falta) { this.paso = p.n; this.errorMsg = falta; return; }
    }

    this.isSaving = true;
    this.errorMsg = '';

    const num = (v: any) => (v === '' || v === null || v === undefined ? undefined : Number(v));

    const data: any = {
      // El completo para los listados y la descripción de la ONT, y separados
      // para la ficha del cliente, que los tiene en dos campos.
      client_name: this.nombreCompleto,
      client_firstname: this.form.client_nombres.trim(),
      client_lastname: this.form.client_apellidos.trim(),
      client_dni: this.form.client_dni,
      client_phone: this.form.client_phone,
      client_email: this.form.client_email || undefined,
      address: this.form.address,
      neighborhood: this.form.neighborhood || undefined,

      internet_plan_id: num(this.form.internet_plan_id),
      grupo_facturacion: num(this.form.grupo_facturacion),

      connection_type: this.form.connection_type,
      router_id: num(this.form.router_id),
      pppoe_user: this.esPppoe ? (this.form.pppoe_user || undefined) : undefined,
      pppoe_password: this.esPppoe ? (this.form.pppoe_password || undefined) : undefined,
      pppoe_profile: this.esPppoe ? (this.form.pppoe_profile || undefined) : undefined,
      ip_asignada: this.esPppoe ? undefined : (this.form.ip_asignada || undefined),
      vlan: num(this.form.vlan),

      olt_id: num(this.form.olt_id),
      line_profile_id: num(this.form.line_profile_id),
      srv_profile_id: num(this.form.srv_profile_id),
      onu_type: this.form.onu_type || undefined,

      wifi_ssid: this.form.wifi_ssid || undefined,
      wifi_password: this.form.wifi_password || undefined,

      scheduled_date: this.form.scheduled_date,
      scheduled_time: this.form.scheduled_time,
      installation_cost: this.form.installation_cost ? parseFloat(this.form.installation_cost) : 0,
      technician_ids: this.form.technician_ids?.length ? this.form.technician_ids : undefined,
      commission_amount: this.form.commission_amount ? parseFloat(this.form.commission_amount) : 0,
      observations: this.form.observations || undefined,
    };

    this.svc.create(data).subscribe({
      next: r => {
        this.isSaving = false;
        if (r.status === 0 || r.status === undefined) {
          this.toast(r.message || 'Instalación creada');
          this.router.navigate(['/dashboard/installations']);
        } else {
          this.errorMsg = r.message || 'Error al crear';
        }
      },
      error: e => {
        this.isSaving = false;
        // El backend dice qué campo rechazó: sirve más que «Error al crear».
        const v = e?.error?.errors;
        this.errorMsg = v ? Object.values(v).flat().join(' ') : (e?.error?.message || 'Error al crear');
      },
    });
  }

  toast(msg: string): void {
    this.successMsg = msg;
    setTimeout(() => { this.successMsg = ''; }, 3500);
  }

  get isValid(): boolean { return this.PASOS.every(p => this.pasoCompleto(p.n)); }
}
