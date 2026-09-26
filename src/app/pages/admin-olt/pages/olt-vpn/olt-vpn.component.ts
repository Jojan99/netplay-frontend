import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OltNavComponent } from '../../shared/olt-nav.component';
import { OltService } from '../../../../services/olt.service';
import { ToastService } from '../../../../services/toast.service';
import { NpSelectComponent, PresentacionSelect } from '../../../../common/np-select/np-select.component';
import { PRESENTACION_OLTS } from '../../../../common/np-select/presentaciones';

interface TunelVpn {
  id: number;
  nombre: string;
  router_id: number | null;
  ip_tunel: string;
  redes_remotas: string[];
  clave_publica: string;
  puerto_router: number;
  activo: boolean;
  en_servidor: boolean;
  endpoint: string | null;
  ultimo_saludo: string | null;
  conectado: boolean;
  bytes_rx: number;
  bytes_tx: number;
  notas: string | null;
}

/**
 * VPN de gestión.
 *
 * Hoy la plataforma llega a las OLT abriendo una sesión SSH en el MikroTik del
 * cliente y tunelizando por ahí. Eso obliga a tener SSH expuesto en el router,
 * a guardar su usuario y contraseña, y a pagar el costo de abrir la sesión en
 * cada consulta. Con un túnel WireGuard el router marca hacia el servidor una
 * sola vez y la OLT queda direccionable como si estuviera en la red local.
 */
@Component({
  selector: 'app-olt-vpn',
  standalone: true,
  imports: [CommonModule, FormsModule, NpSelectComponent, OltNavComponent],
  templateUrl: './olt-vpn.component.html',
  styleUrls: ['../../shared/olt.scss', './olt-vpn.component.scss', '../../shared/olt-movil.scss'],
  host: { class: 'np-console' },
})
export class OltVpnComponent implements OnInit {

  cargando = false;
  estado: any = null;
  error: string | null = null;

  olts: any[] = [];

  // Alta de túnel
  modal = false;
  guardando = false;
  form = { nombre: '', redes_remotas: '', keepalive: 25, puerto_router: 13231, notas: '' };

  // Script entregado
  scriptModal = false;
  script = '';
  tunelDelScript: TunelVpn | null = null;
  recienCreado = false;

  // Instalación del servidor
  instaladorModal = false;
  instalador: { comando: string; script: string } | null = null;

  // Pasar una OLT al túnel
  oltModal = false;
  tunelParaOlt: TunelVpn | null = null;
  oltElegida: number | null = null;
  moviendo = false;

  /**
   * OLT para pasar al túnel: modelo, IP y cómo se llega hoy. La insignia marca
   * las que caen dentro de las redes del túnel, que son las que pueden pasar.
   * En el modelo queda el id, como antes.
   */
  readonly presOlts: PresentacionSelect = {
    ...PRESENTACION_OLTS,
    valor: o => o?.id,
    detalle: o => [o?.model, o?.host, o?.access_mode === 'jump' ? 'por jump host' : 'directo'].filter(Boolean).join(' · '),
    insignia: o => (this.caeEn(o?.host ?? null, this.tunelParaOlt?.redes_remotas ?? [])
      ? { texto: 'En las redes del túnel', tono: 'ok' }
      : (o?.access_mode === 'jump' ? { texto: 'Por jump host', tono: 'neutral' } : null)),
  };

  // Prueba de alcance
  probando = false;
  pruebaIp = '';
  pruebaPuerto = 23;
  tunelProbado: number | null = null;

  borrando: TunelVpn | null = null;

  constructor(
    private olt: OltService,
    private toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.cargar();
    this.olt.listOlts().subscribe({
      next: (res) => { this.olts = res?.data ?? []; },
      error: () => { /* la pantalla funciona igual sin la lista */ },
    });
  }

  @HostListener('document:keydown.escape')
  cerrarConEsc(): void {
    this.modal = this.scriptModal = this.instaladorModal = this.oltModal = false;
    this.borrando = null;
  }

  cargar(): void {
    this.cargando = true;
    this.error    = null;

    this.olt.getVpnEstado().subscribe({
      next: (res) => {
        this.cargando = false;
        this.estado   = res?.data ?? null;
        this.error    = this.estado?.error ?? null;
      },
      error: (err) => {
        this.cargando = false;
        this.error    = err?.error?.message || 'No se pudo leer el estado de la VPN';
      },
    });
  }

  // ── Datos derivados ─────────────────────────────────────────────────────

  get servidor(): any        { return this.estado?.servidor ?? null; }
  get tuneles(): TunelVpn[]  { return this.estado?.tuneles ?? []; }
  get instalado(): boolean   { return !!this.estado?.ayudante_instalado; }
  get levantada(): boolean   { return !!this.estado?.levantada; }
  get conectados(): number   { return this.tuneles.filter(t => t.conectado).length; }

  /** Las OLT que siguen dependiendo del jump host. */
  get oltsConJump(): any[] {
    return this.olts.filter(o => o.access_mode === 'jump');
  }

  // ── Instalación ─────────────────────────────────────────────────────────

  verInstalador(): void {
    this.olt.getVpnInstalador().subscribe({
      next: (res) => {
        this.instalador      = res?.data ?? null;
        this.instaladorModal = true;
      },
      error: (err) => this.toast.error(err?.error?.message || 'No se pudo generar el instalador'),
    });
  }

  // ── Túneles ─────────────────────────────────────────────────────────────

  /** El túnel que se está editando; null cuando el modal es para uno nuevo. */
  editando: any = null;

  abrirAlta(): void {
    this.editando = null;
    this.form  = { nombre: '', redes_remotas: '', keepalive: 25, puerto_router: 13231, notas: '' };
    this.modal = true;
  }

  /**
   * Editar un túnel que ya existe: sobre todo para agregarle redes.
   *
   * Al guardar, el servidor rehace su configuración de WireGuard, así que las
   * redes nuevas quedan alcanzables sin tocar el router.
   */
  abrirEdicion(t: any): void {
    this.editando = t;
    this.form = {
      nombre:        t.nombre ?? '',
      redes_remotas: (t.redes_remotas ?? []).join(', '),
      keepalive:     t.keepalive ?? 25,
      puerto_router: t.puerto_router ?? 13231,
      notas:         t.notas ?? '',
    };
    this.modal = true;
  }

  guardar(): void {
    if (this.editando) { this.actualizar(); return; }
    this.crear();
  }

  private actualizar(): void {
    if (!this.puedeGuardar || this.guardando) return;

    this.guardando = true;

    this.olt.actualizarTunelVpn(this.editando.id, {
      nombre:        this.form.nombre.trim(),
      redes_remotas: this.form.redes_remotas.trim(),
      keepalive:     this.form.keepalive,
      puerto_router: this.form.puerto_router,
      notas:         this.form.notas.trim() || null,
    }).subscribe({
      next: (res) => {
        this.guardando = false;
        if (res?.status === 1) { this.toast.error(res.message); return; }
        this.modal = false;
        this.toast.success(res?.message || 'Túnel actualizado');
        this.cargar();
      },
      error: (err) => {
        this.guardando = false;
        this.toast.error(err?.error?.message || 'No se pudo guardar el túnel');
      },
    });
  }

  get puedeGuardar(): boolean {
    return this.form.nombre.trim() !== '' && this.redesAEnviar !== '';
  }

  /**
   * Redes que conviene poner en un túnel nuevo: la /24 de cada OLT con IP
   * privada que todavía no cae en ningún túnel. La IP del túnel en sí no se
   * pide: la plataforma asigna la siguiente libre de la red del servidor.
   */
  get redesSugeridas(): string[] {
    const privada = (ip: string) => /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
    const redes   = this.olts
      .map(o => (o.host || '').trim())
      .filter(ip => /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) && privada(ip))
      .filter(ip => !this.tuneles.some(t => this.caeEn(ip, t.redes_remotas)))
      .map(ip => ip.split('.').slice(0, 3).join('.') + '.0/24');

    return [...new Set(redes)];
  }

  /** Las redes escritas, o las sugeridas si el campo quedó vacío en un alta. */
  private get redesAEnviar(): string {
    const escritas = this.form.redes_remotas.trim();
    if (escritas || this.editando) return escritas;
    return this.redesSugeridas.join(', ');
  }

  agregarRed(red: string): void {
    const actuales = this.form.redes_remotas.split(',').map(r => r.trim()).filter(Boolean);
    if (!actuales.includes(red)) actuales.push(red);
    this.form.redes_remotas = actuales.join(', ');
  }

  crear(): void {
    if (!this.puedeGuardar || this.guardando) return;

    this.guardando = true;

    this.olt.crearTunelVpn({
      nombre:        this.form.nombre.trim(),
      redes_remotas: this.redesAEnviar,
      keepalive:     this.form.keepalive,
      puerto_router: this.form.puerto_router,
      notas:         this.form.notas.trim() || null,
    }).subscribe({
      next: (res) => {
        this.guardando = false;

        if (res?.status === 1) { this.toast.error(res.message); return; }

        this.modal          = false;
        this.script         = res?.data?.script ?? '';
        this.tunelDelScript = res?.data?.tunel ?? null;
        this.recienCreado   = true;
        this.scriptModal    = true;
        this.toast.success(res?.message || 'Túnel creado');
        this.cargar();
      },
      error: (err) => {
        this.guardando = false;
        this.toast.error(err?.error?.message || 'No se pudo crear el túnel');
      },
    });
  }

  verScript(tunel: TunelVpn): void {
    this.olt.getScriptTunel(tunel.id).subscribe({
      next: (res) => {
        this.script         = res?.data?.script ?? '';
        this.tunelDelScript = tunel;
        this.recienCreado   = false;
        this.scriptModal    = true;
      },
      error: (err) => this.toast.error(err?.error?.message || 'No se pudo generar el script'),
    });
  }

  copiarScript(): void {
    navigator.clipboard?.writeText(this.script).then(
      () => this.toast.success('Script copiado. Pegalo en la terminal del router.'),
      () => this.toast.error('El navegador no permitió copiar; seleccione el texto a mano.'),
    );
  }

  copiar(texto: string, queEs: string): void {
    navigator.clipboard?.writeText(texto).then(
      () => this.toast.success(queEs + ' copiado'),
      () => this.toast.error('El navegador no permitió copiar'),
    );
  }

  descargarScript(): void {
    const nombre = (this.tunelDelScript?.nombre ?? 'tunel').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase();
    const blob   = new Blob([this.script], { type: 'text/plain;charset=utf-8' });
    const url    = URL.createObjectURL(blob);
    const a      = document.createElement('a');

    a.href = url;
    a.download = `netplay-vpn-${nombre}.rsc`;
    a.click();

    URL.revokeObjectURL(url);
  }

  confirmarBorrado(tunel: TunelVpn): void { this.borrando = tunel; }

  borrar(): void {
    if (!this.borrando) return;

    this.olt.eliminarTunelVpn(this.borrando.id).subscribe({
      next: (res) => {
        if (res?.status === 1) { this.toast.error(res.message); this.borrando = null; return; }

        this.toast.success(res?.message || 'Túnel eliminado');
        this.borrando = null;
        this.cargar();
      },
      error: (err) => {
        this.toast.error(err?.error?.message || 'No se pudo eliminar');
        this.borrando = null;
      },
    });
  }

  // ── Pasar una OLT al túnel ──────────────────────────────────────────────

  abrirOlt(tunel: TunelVpn): void {
    this.tunelParaOlt = tunel;
    // Se sugiere la primera OLT que todavía use jump host.
    this.oltElegida   = this.oltsConJump[0]?.id ?? this.olts[0]?.id ?? null;
    this.oltModal     = true;
  }

  moverOlt(): void {
    if (!this.tunelParaOlt || !this.oltElegida || this.moviendo) return;

    this.moviendo = true;

    this.olt.usarTunelEnOlt(this.tunelParaOlt.id, this.oltElegida).subscribe({
      next: (res) => {
        this.moviendo = false;

        if (res?.status === 1) { this.toast.error(res.message); return; }

        this.oltModal = false;
        this.toast.success(res?.message || 'OLT pasada al túnel');
        this.ngOnInit();
      },
      error: (err) => {
        this.moviendo = false;
        this.toast.error(err?.error?.message || 'No se pudo cambiar el acceso de la OLT');
      },
    });
  }

  /** La IP de la OLT elegida, para avisar si no cae en las redes del túnel. */
  get hostDeOltElegida(): string | null {
    return this.olts.find(o => o.id === this.oltElegida)?.host ?? null;
  }

  // ── Prueba de alcance ───────────────────────────────────────────────────

  probar(tunel: TunelVpn): void {
    const ip = this.pruebaIp.trim() || this.primeraIpUtil(tunel);

    if (!ip) {
      this.toast.error('Escriba una IP para probar.');
      return;
    }

    this.probando      = true;
    this.tunelProbado  = tunel.id;

    this.olt.probarTunel(tunel.id, ip, this.pruebaPuerto || 23).subscribe({
      next: (res) => {
        this.probando = false;
        if (res?.status === 0) this.toast.success(res.message);
        else                   this.toast.error(res.message);
      },
      error: (err) => {
        this.probando = false;
        this.toast.error(err?.error?.message || 'No se pudo probar el alcance');
      },
    });
  }

  /** Si el operador no escribió nada, se prueba la OLT que caiga en el túnel. */
  private primeraIpUtil(tunel: TunelVpn): string | null {
    const dentro = this.olts.find(o => this.caeEn(o.host, tunel.redes_remotas));
    return dentro?.host ?? null;
  }

  private caeEn(ip: string | null, redes: string[]): boolean {
    if (!ip) return false;

    const aLong = (x: string) => x.split('.').reduce((n, p) => (n << 8) + (+p), 0) >>> 0;

    return (redes ?? []).some(red => {
      const [base, bits] = red.split('/');
      const mascara = +bits === 0 ? 0 : (0xFFFFFFFF << (32 - +bits)) >>> 0;
      return (aLong(ip) & mascara) === (aLong(base) & mascara);
    });
  }

  // ── Presentación ────────────────────────────────────────────────────────

  transferencia(bytes: number): string {
    if (!bytes) return '—';

    const unidades = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let v = bytes;

    while (v >= 1024 && i < unidades.length - 1) { v /= 1024; i++; }

    return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${unidades[i]}`;
  }

  /** Hace cuánto saludó, que es lo que dice si el túnel está vivo. */
  haceCuanto(iso: string | null): string {
    if (!iso) return 'nunca';

    const segundos = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);

    if (segundos < 60)   return `hace ${segundos} s`;
    if (segundos < 3600) return `hace ${Math.floor(segundos / 60)} min`;
    if (segundos < 86400) return `hace ${Math.floor(segundos / 3600)} h`;

    return `hace ${Math.floor(segundos / 86400)} d`;
  }

  nombreDeOlt(id: number | null): string {
    return this.olts.find(o => o.id === id)?.name ?? '';
  }
}
