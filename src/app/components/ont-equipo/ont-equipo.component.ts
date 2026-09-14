import { Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OltService } from '../../services/olt.service';
import { AcsService } from '../../services/acs.service';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';

/** Lo que se sabe de la ONT sin preguntarle a la OLT: sale de olt_onts. */
export interface OntVinculada {
  olt?: string | null;
  fsp: string;
  ont_id: number;
  serial?: string | null;
  estado?: string | null;
}

interface Led { nombre: string; estado: 'on' | 'off' | 'alarma' | 'nada'; titulo: string; }

/** Color de cada fabricante, el mismo que usan las marcas de OLT. */
const COLOR_MARCA: Record<string, string> = {
  'C-Data': '#0f7a4e', 'Huawei': '#c7000b', 'ZTE': '#0a4b9b', 'V-SOL': '#d2691e',
  'FiberHome': '#e2231a', 'Nokia': '#124191', 'TP-Link': '#4acbd6',
};

/**
 * El equipo del cliente: foto o dibujo con sus luces, modelo, señal y WiFi.
 *
 * Hace dos consultas por separado: la señal sale por SNMP en décimas de
 * segundo; el modelo y el WiFi, por la consola de la OLT, tardan unos
 * segundos. Así lo rápido se ve enseguida y lo lento llega después.
 */
@Component({
  selector: 'app-ont-equipo',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './ont-equipo.component.html',
  styleUrl: './ont-equipo.component.scss',
})
export class OntEquipoComponent implements OnChanges {
  private olt = inject(OltService);
  private acsSvc = inject(AcsService);

  @Input({ required: true }) userId!: number;
  @Input() ont: OntVinculada | null = null;

  vivo: any = null;
  equipo: any = null;
  /** El mismo equipo visto por el servidor TR-069, si reporta ahí. */
  acs: any = null;
  midiendo = false;
  consultandoEquipo = false;
  subiendoFoto = false;
  errorFoto = '';

  /** SSID con la clave visible. */
  claveVisible: Record<number, boolean> = {};
  copiado = '';
  verApagadas = false;

  /** La dirección que hay que cargarle al equipo para que entre al TR-069. */
  urlAcs = '';

  /** La red a la que se le está cambiando la contraseña. */
  cambiandoClave: { indice: number; clave: string; todas: boolean } | null = null;
  guardandoClave = false;
  avisoClave: { texto: string; tipo: 'ok' | 'error' } | null = null;

  /** Único por instancia: el degradado del dibujo se referencia por id. */
  readonly gid = 'oe' + Math.random().toString(36).slice(2, 8);

  ngOnChanges(c: SimpleChanges) {
    if (c['userId'] && this.userId) this.cargar();
  }

  /**
   * Redes encendidas cuya contraseña se puede cambiar. Sólo las confirmadas
   * activas: hay equipos con redes secundarias de estado desconocido que no
   * tienen por qué recibir la contraseña.
   */
  get redesConClave(): number { return this.redesAcs.filter((r: any) => !!r.ruta_clave && r.activo === true).length; }

  empezarCambioClave(r: any) {
    this.cambiandoClave = { indice: r.indice, clave: '', todas: true };
    this.avisoClave = null;
  }

  /** Una contraseña fácil de dictar por teléfono: sin 0/O ni 1/l. */
  generarClave() {
    if (!this.cambiandoClave) return;
    const letras = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const azar = new Uint32Array(12);
    crypto.getRandomValues(azar);
    this.cambiandoClave.clave = Array.from(azar, n => letras[n % letras.length]).join('');
  }

  guardarClave() {
    const c = this.cambiandoClave;
    if (!c || !this.acs?.id) return;

    const clave = c.clave.trim();
    if (clave.length < 8 || clave.length > 63) {
      this.avisoClave = { texto: 'La contraseña debe tener entre 8 y 63 caracteres.', tipo: 'error' };
      return;
    }

    const todas = c.todas && this.redesConClave > 1;
    this.guardandoClave = true;
    this.acsSvc.cambiarWifi(this.acs.id, c.indice, null, clave, todas).subscribe({
      next: (r: any) => {
        this.guardandoClave = false;
        if (r?.error !== 0) { this.avisoClave = { texto: r?.message || 'No se pudo cambiar la contraseña.', tipo: 'error' }; return; }
        this.cambiandoClave = null;
        this.avisoClave = {
          texto: (todas ? 'Contraseña cambiada en todas las redes.' : 'Contraseña cambiada.') + ' Los equipos del cliente tienen que volver a conectarse con la nueva.',
          tipo: 'ok',
        };
        // El equipo tarda unos segundos en aplicarlo y reportarlo.
        setTimeout(() => this.acsSvc.deCliente(this.userId).subscribe({ next: (x: any) => { if (x?.error === 0) this.acs = x.data; } }), 5000);
      },
      error: () => { this.guardandoClave = false; this.avisoClave = { texto: 'No se pudo cambiar la contraseña.', tipo: 'error' }; },
    });
  }

  cargar(refrescar = false) {
    const id = this.userId;
    this.midiendo = true;
    this.consultandoEquipo = true;
    if (refrescar) { this.claveVisible = {}; }

    this.olt.ontEnVivo(id, refrescar).subscribe({
      next: r => { if (id !== this.userId) return; this.midiendo = false; this.vivo = r?.data?.vivo ?? { error: r?.message }; },
      error: () => { this.midiendo = false; this.vivo = { error: 'La OLT no respondió.' }; },
    });

    // Sin permiso al módulo o sin ACS, simplemente no se muestra.
    this.acsSvc.deCliente(id).subscribe({
      next: r => {
        if (id !== this.userId) return;
        this.acs = r?.error === 0 ? r.data : null;
        if (!this.acs) this.acsSvc.estado().subscribe({ next: (e: any) => this.urlAcs = e?.data?.url_acs ?? '' });
      },
      error: () => { this.acs = null; },
    });

    this.olt.equipoDeCliente(id, refrescar).subscribe({
      next: r => { if (id !== this.userId) return; this.consultandoEquipo = false; this.equipo = r?.data ?? { error: r?.message }; },
      error: () => { this.consultandoEquipo = false; this.equipo = { error: 'No se pudo consultar el equipo.' }; },
    });
  }

  // ── Lo que se muestra ─────────────────────────────────────────────────────

  get version(): any { return this.equipo?.version ?? null; }

  get marca(): string {
    return this.version?.fabricante ?? '';
  }

  get modelo(): string {
    return this.version?.modelo ?? this.vivo?.modelo ?? '';
  }

  get colorMarca(): string {
    return COLOR_MARCA[this.marca] ?? 'var(--accent)';
  }

  /** En línea según la OLT ahora; si no respondió, lo último guardado. */
  get enLinea(): boolean | null {
    const s = this.vivo && !this.vivo.error ? this.vivo.status : this.ont?.estado;
    return s ? s === 'online' : null;
  }

  get wifi(): any { return this.equipo?.wifi ?? null; }

  /** WiFi por TR-069: sirve cuando la OLT no lo entrega (Huawei, ZTE…). */
  get redesAcs(): any[] {
    if (this.redesActivas.length) return [];
    return (this.acs?.wifi ?? []).filter((r: any) => r.activo !== false);
  }

  get redesActivas(): any[] { return (this.wifi?.ssids ?? []).filter((s: any) => s.activo); }
  get redesApagadas(): any[] { return (this.wifi?.ssids ?? []).filter((s: any) => !s.activo); }

  /** Las luces del frente, sólo con lo que se sabe de verdad. */
  get leds(): Led[] {
    const online = this.enLinea;
    const mala = ['critica', 'saturada'].includes(this.vivo?.estado);
    const wifiOn = this.wifi?.activo;
    return [
      { nombre: 'PWR', estado: online === null ? 'nada' : online ? 'on' : 'nada', titulo: 'Encendido' },
      { nombre: 'PON', estado: online ? 'on' : online === false ? 'off' : 'nada', titulo: online ? 'Registrada en la OLT' : 'Sin registro en la OLT' },
      { nombre: 'LOS', estado: online === false || mala ? 'alarma' : 'off', titulo: online === false ? 'Sin señal' : mala ? 'Señal fuera de rango' : 'Sin alarma' },
      { nombre: 'WLAN', estado: wifiOn === true ? 'on' : wifiOn === false ? 'off' : 'nada', titulo: wifiOn ? 'WiFi encendido' : wifiOn === false ? 'WiFi apagado' : 'WiFi sin dato' },
    ];
  }

  etiquetaSenal(estado: string): string {
    return ({ buena: 'Buena', regular: 'Regular', baja: 'Baja', critica: 'Crítica', saturada: 'Saturada', sin_senal: 'Sin señal' } as any)[estado] ?? 'Sin dato';
  }

  /** Dónde cae la potencia en la barra, de -35 dBm (0 %) a -5 dBm (100 %). */
  posicionSenal(dbm: number | null): number {
    if (dbm === null || dbm === undefined) return 0;
    return Math.max(0, Math.min(100, ((dbm + 35) / 30) * 100));
  }

  cifrado(modo: string): string {
    return ({ wpa_wpa2: 'WPA/WPA2', wpa2: 'WPA2', wpa: 'WPA', wpa3: 'WPA3', wpa2_wpa3: 'WPA2/WPA3', open: 'Abierta', none: 'Abierta', wep: 'WEP' } as any)[(modo || '').toLowerCase()] ?? modo;
  }

  // ── Acciones ──────────────────────────────────────────────────────────────

  async copiar(texto: string, que: string) {
    try {
      await navigator.clipboard.writeText(texto);
      this.copiado = que;
      setTimeout(() => { if (this.copiado === que) this.copiado = ''; }, 1500);
    } catch { /* sin permiso de portapapeles: no pasa nada */ }
  }

  subirFoto(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const archivo = input.files?.[0];
    input.value = '';
    if (!archivo || !this.version) return;
    if (archivo.size > 4 * 1024 * 1024) { this.errorFoto = 'La foto pesa más de 4 MB.'; return; }

    this.subiendoFoto = true;
    this.errorFoto = '';
    this.olt.subirFotoDeModelo(this.version.fabricante_id ?? '', this.version.modelo ?? '', archivo).subscribe({
      next: r => {
        this.subiendoFoto = false;
        if (r?.error) { this.errorFoto = r?.message || 'No se pudo guardar la foto.'; return; }
        this.equipo = { ...this.equipo, foto: r?.data?.foto };
      },
      error: () => { this.subiendoFoto = false; this.errorFoto = 'No se pudo guardar la foto (jpg, png o webp de hasta 4 MB).'; },
    });
  }

  quitarFoto() {
    if (!this.version) return;
    this.olt.borrarFotoDeModelo(this.version.fabricante_id ?? '', this.version.modelo ?? '').subscribe({
      next: () => { this.equipo = { ...this.equipo, foto: null }; },
    });
  }
}
