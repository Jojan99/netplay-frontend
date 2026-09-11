import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OltService } from '../../../services/olt.service';
import { ToastService } from '../../../services/toast.service';

interface PuertoOlt {
  ifindex: number;
  nombre: string;
  alias: string | null;
  enlace: 'up' | 'down' | 'transicion' | 'desconocido';
  habilitado: boolean;
  mbps: number | null;
  fsp?: string | null;
  /** Uplinks: "GE1", "XGE2". Sin el tipo, ge0/0/1 y xge0/0/1 salían los dos como "1". */
  etiqueta?: string;
  /** Puertos PON de OLT que publican cada ONU como interfaz. */
  onus?: number;
  onus_arriba?: number;
}

interface TarjetaOlt {
  indice: string;
  nombre: string | null;
  modelo: string | null;
  descripcion: string | null;
  serie: string | null;
  software: string | null;
  posicion: string | null;
}

/**
 * La ficha del equipo OLT.
 *
 * En vez de una foto de catálogo —que puede no ser el modelo instalado— se
 * dibuja el frente del equipo con los puertos que la OLT misma reporta: cuáles
 * tienen fibra enganchada, cuáles están libres y cómo están los uplinks. Si el
 * operador sube una foto de su equipo, esa manda.
 */
@Component({
  selector: 'app-olt-equipo',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './olt-equipo.component.html',
  styleUrls: ['./olt.scss', './olt-equipo.scss'],
})
export class OltEquipoComponent implements OnChanges {

  @Input() oltId: number | null = null;

  /** Marca configurada en la plataforma, para avisar si no coincide. */
  @Input() marcaConfigurada: string | null = null;

  @Output() modeloDetectado = new EventEmitter<string>();

  cargando = false;
  error: string | null = null;
  ficha: any = null;
  subiendo = false;
  verTarjetas = false;

  diagnosticando = false;
  diagnostico: any = null;

  constructor(
    private olt: OltService,
    private toast: ToastService,
  ) {}

  ngOnChanges(cambios: SimpleChanges): void {
    if (cambios['oltId']) this.cargar();
  }

  cargar(refrescar = false): void {
    if (!this.oltId) { this.ficha = null; return; }

    this.cargando = true;
    this.error    = null;

    this.olt.getEquipo(this.oltId, refrescar).subscribe({
      next: (res) => {
        this.cargando = false;
        this.ficha    = res?.data ?? null;

        // El backend responde status 1 cuando la OLT no contesta por SNMP,
        // pero igual manda la ficha con el motivo.
        if (res?.status === 1 || this.ficha?.responde === false) {
          this.error = this.ficha?.error || res?.message || 'La OLT no respondió por SNMP';
        }

        const modelo = this.ficha?.identidad?.modelo;
        if (modelo) this.modeloDetectado.emit(modelo);
      },
      error: (err) => {
        this.cargando = false;
        this.error    = err?.error?.message || 'No se pudo consultar el equipo';
      },
    });
  }

  // ── Datos derivados ─────────────────────────────────────────────────────

  get identidad(): any            { return this.ficha?.identidad ?? null; }
  get puertos(): PuertoOlt[]      { return this.ficha?.puertos_pon ?? []; }
  get uplinks(): PuertoOlt[]      { return this.ficha?.uplinks ?? []; }
  get tarjetas(): TarjetaOlt[]    { return this.ficha?.tarjetas ?? []; }
  get foto(): string | null       { return this.ficha?.foto ?? null; }

  get conEnlace(): number { return this.puertos.filter(p => p.enlace === 'up').length; }

  /** Aviso cuando el equipo dice ser de otra marca que la configurada. */
  get avisoDeMarca(): string | null {
    if (!this.ficha || this.ficha.marca_coincide !== false) return null;

    const detectada = this.ficha.marca_detectada;
    if (!detectada) return null;

    return `El equipo se identifica como ${detectada.toUpperCase()} y en la plataforma está configurado como `
      + `${(this.marcaConfigurada || this.ficha.marca_configurada || '—').toUpperCase()}. `
      + 'Los comandos de autorización no le van a servir hasta corregir la marca.';
  }

  /** Las tarjetas se agrupan por slot para dibujar el chasis. */
  get slots(): { slot: string; puertos: PuertoOlt[] }[] {
    const grupos: Record<string, PuertoOlt[]> = {};

    for (const p of this.puertos) {
      // "0/0/9" → slot "0/0"; si no hay F/S/P, todo va junto.
      const slot = (p.fsp ?? '').split('/').slice(0, 2).join('/') || 'PON';
      (grupos[slot] ||= []).push(p);
    }

    return Object.entries(grupos)
      .map(([slot, puertos]) => ({ slot, puertos }))
      .sort((a, b) => a.slot.localeCompare(b.slot, undefined, { numeric: true }));
  }

  /** El número que se pinta en cada puerto del dibujo. */
  numeroDe(p: PuertoOlt): string {
    if (p.etiqueta) return p.etiqueta;

    const partes = (p.fsp ?? '').split('/');
    return partes.length === 3 ? partes[2] : p.nombre.replace(/\D+/g, '');
  }

  claseDe(p: PuertoOlt): string {
    if (!p.habilitado)          return 'is-off';
    if (p.enlace === 'up')      return 'is-up';
    if (p.enlace === 'transicion') return 'is-warn';
    return 'is-free';
  }

  tituloDe(p: PuertoOlt): string {
    const estado = !p.habilitado ? 'administrativamente abajo'
      : p.enlace === 'up' ? 'con enlace'
      : p.enlace === 'transicion' ? 'negociando'
      : 'sin enlace';

    const onus = p.onus ? ` · ${p.onus_arriba ?? 0} de ${p.onus} ONU arriba` : '';

    return `${p.nombre} — ${estado}${onus}${p.mbps ? ` · ${p.mbps} Mbps` : ''}${p.alias ? ` · ${p.alias}` : ''}`;
  }

  /** El tipo de tarjeta, sacado de la descripción larga del fabricante. */
  tipoDeTarjeta(t: TarjetaOlt): string {
    const texto = t.descripcion ?? '';

    if (/fan|ventilad/i.test(texto))                 return 'Ventilación';
    if (/control|backplane|MCU|SCU/i.test(texto))    return 'Control';
    if (/power|PRT[EW]|fuente/i.test(texto))         return 'Alimentación';
    if (/GPON|EPON|interface board/i.test(texto))    return 'Fibra';
    if (/uplink|GE|10G/i.test(texto))                return 'Uplink';

    return '—';
  }

  // ── Diagnóstico ─────────────────────────────────────────────────────────

  /** Prueba cada eslabón: marca, jump host, consola y SNMP. */
  diagnosticar(): void {
    if (!this.oltId) return;

    this.diagnosticando = true;
    this.diagnostico    = null;

    this.olt.diagnosticoOlt(this.oltId).subscribe({
      next: (res) => {
        this.diagnosticando = false;
        this.diagnostico    = res?.data ?? null;

        if (res?.status === 0) this.toast.success(res?.message || 'La OLT responde');
        else                   this.toast.error(res?.message || 'La OLT no responde');
      },
      error: (err) => {
        this.diagnosticando = false;
        this.toast.error(err?.error?.message || 'No se pudo diagnosticar la OLT');
      },
    });
  }

  /** Vuelve a leer el mapa de puertos: hace falta si le cambiaron una placa. */
  olvidarPuertos(): void {
    if (!this.oltId) return;

    this.olt.olvidarPuertosOlt(this.oltId).subscribe({
      next: (res) => {
        this.toast.success(res?.message || 'Se volverá a leer el equipo');
        this.cargar(true);
      },
      error: (err) => this.toast.error(err?.error?.message || 'No se pudo limpiar lo guardado'),
    });
  }

  // ── Foto ────────────────────────────────────────────────────────────────

  elegirFoto(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0];

    if (!archivo || !this.oltId) return;

    this.subiendo = true;

    this.olt.subirFotoOlt(this.oltId, archivo).subscribe({
      next: (res) => {
        this.subiendo = false;
        input.value   = '';
        this.toast.success(res?.message || 'Foto guardada');

        if (this.ficha) this.ficha.foto = res?.data?.foto ?? this.ficha.foto;
      },
      error: (err) => {
        this.subiendo = false;
        input.value   = '';
        this.toast.error(err?.error?.message || 'No se pudo subir la foto');
      },
    });
  }

  quitarFoto(): void {
    if (!this.oltId) return;

    this.olt.borrarFotoOlt(this.oltId).subscribe({
      next: (res) => {
        this.toast.success(res?.message || 'Foto eliminada');
        if (this.ficha) this.ficha.foto = null;
      },
      error: (err) => this.toast.error(err?.error?.message || 'No se pudo eliminar la foto'),
    });
  }
}
