import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FallasSectorService } from '../../services/fallas-sector.service';
import { ToastService } from '../../services/toast.service';

interface Falla {
  id: number; estado: string; sector: string; caidas: number; maximo_caidas: number; total: number;
  empezo_en: string; resuelta_en: string | null; afectados: number; avisados_inicio: number; avisados_fin: number; errores: number;
  mantenimiento: number; nota: string | null;
  // Calculado al cargar (nada de getters en la plantilla).
  estadoTexto: string; tono: string; desde: string; duracion: string; abierta: boolean;
}

/**
 * Fallas de sector: cuando se caen muchas ONT del mismo puerto PON se avisa a los clientes
 * afectados por WhatsApp, y otra vez cuando vuelve el servicio. Todo se ajusta desde aquí.
 */
@Component({
  selector: 'app-fallas-sector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './fallas-sector.component.html',
  styleUrls: ['./fallas-sector.component.scss'],
})
export class FallasSectorComponent implements OnInit, OnDestroy {
  private api = inject(FallasSectorService);
  private toast = inject(ToastService);

  vista: 'fallas' | 'config' | 'sectores' = 'fallas';
  cargando = true;
  negado = '';
  guardando = false;

  cfg: any = null;
  defecto: { mensaje_inicio: string; mensaje_fin: string } = { mensaje_inicio: '', mensaje_fin: '' };
  ejemplo: { inicio: string; fin: string } = { inicio: '', fin: '' };
  lineas: any[] = [];
  puertos: any[] = [];
  fallas: Falla[] = [];
  abiertas = 0;
  porAprobar = 0;
  avisadosMes = 0;
  fallasMes = 0;

  detalle: any = null;
  telefonoPrueba = '';

  private refresco: any = null;

  ngOnInit(): void {
    this.cargar();
    // Mientras haya una falla abierta, la lista se actualiza sola.
    this.refresco = setInterval(() => { if (this.abiertas && this.vista === 'fallas' && !this.detalle) this.cargar(true); }, 30000);
  }

  ngOnDestroy(): void { clearInterval(this.refresco); }

  cargar(silencioso = false): void {
    if (!silencioso) this.cargando = true;
    this.api.estado().subscribe({
      next: (r: any) => {
        const d = r?.data ?? {};
        this.defecto = d.defecto ?? this.defecto;
        this.cfg = this.normalizar(d.config ?? {});
        this.ejemplo = d.ejemplo ?? this.ejemplo;
        this.lineas = d.lineas ?? [];
        this.puertos = (d.puertos ?? []).map((p: any) => ({ ...p, nombre: p.nombre ?? '' }));
        this.fallas = (d.fallas ?? []).map((f: any) => this.presentar(f));
        this.abiertas = this.fallas.filter(f => f.abierta).length;
        this.porAprobar = this.fallas.filter(f => f.estado === 'por_aprobar').length;
        this.fallasMes = this.fallas.filter(f => f.estado !== 'descartada').length;
        this.avisadosMes = this.fallas.reduce((s, f) => s + f.avisados_inicio, 0);
        this.cargando = false;
      },
      error: (e) => { this.cargando = false; this.negado = e?.status === 403 ? 'No tiene permiso para ver las fallas de sector.' : 'No se pudo cargar el módulo.'; },
    });
  }

  private normalizar(c: any): any {
    const b = (v: any) => v === true || v === 1 || v === '1';
    return {
      ...c,
      activo: b(c.activo), contar_cortes_de_luz: b(c.contar_cortes_de_luz), avisar_inicio: b(c.avisar_inicio), avisar_fin: b(c.avisar_fin),
      avisar_grupo: b(c.avisar_grupo), incluir_suspendidos: b(c.incluir_suspendidos),
      mensaje_inicio: c.mensaje_inicio || this.defecto.mensaje_inicio || '',
      mensaje_fin: c.mensaje_fin || this.defecto.mensaje_fin || '',
      wa_linea_id: c.wa_linea_id ?? null,
    };
  }

  private presentar(f: any): Falla {
    const textos: Record<string, [string, string]> = {
      detectada: ['Confirmando', 'info'], por_aprobar: ['Esperando aprobación', 'warn'], activa: ['En curso', 'danger'],
      resuelta: ['Resuelta', 'ok'], descartada: ['Descartada', 'neutro'],
    };
    const [estadoTexto, tono] = textos[f.estado] ?? [f.estado, 'neutro'];
    const inicio = new Date(String(f.empezo_en).replace(' ', 'T'));
    const fin = f.resuelta_en ? new Date(String(f.resuelta_en).replace(' ', 'T')) : new Date();
    const min = Math.max(0, Math.round((fin.getTime() - inicio.getTime()) / 60000));
    return {
      ...f, estadoTexto, tono,
      abierta: ['detectada', 'por_aprobar', 'activa'].includes(f.estado),
      desde: inicio.toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' }),
      duracion: min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`,
    };
  }

  abrir(v: 'fallas' | 'config' | 'sectores'): void { this.vista = v; this.detalle = null; }

  // ── Fallas ──────────────────────────────────────────────────────────────
  ver(f: Falla): void {
    this.api.falla(f.id).subscribe({
      next: (r: any) => { this.detalle = { ...r.data, presentada: f }; },
      error: () => this.toast.error('No se pudo abrir la falla.'),
    });
  }

  accion(f: Falla, accion: 'aprobar' | 'descartar' | 'resolver'): void {
    const preguntas: Record<string, string> = {
      aprobar: `Se les va a escribir por WhatsApp a ${f.afectados} clientes de ${f.sector}. ¿Continuar?`,
      descartar: 'No se le escribirá a ningún cliente (por ejemplo, un mantenimiento programado). ¿Descartar la falla?',
      resolver: f.avisados_inicio ? `Se cierra la falla y se les avisa a ${f.avisados_inicio} clientes que el servicio volvió. ¿Continuar?` : '¿Dar la falla por resuelta?',
    };
    if (!confirm(preguntas[accion])) return;
    const nota = accion === 'descartar' ? (prompt('Motivo (opcional):', 'Mantenimiento programado') ?? undefined) : undefined;
    this.api.accion(f.id, accion, nota).subscribe({
      next: (r: any) => { this.avisar(r); this.detalle = null; this.cargar(true); },
      error: (e) => this.avisar(e?.error ?? { error: 1, message: 'No se pudo.' }),
    });
  }

  revisarAhora(): void {
    this.api.revisar().subscribe({
      next: (r: any) => { this.avisar(r); setTimeout(() => this.cargar(true), 8000); },
      error: (e) => this.avisar(e?.error ?? { error: 1, message: 'No se pudo revisar.' }),
    });
  }

  // ── Configuración ───────────────────────────────────────────────────────
  alternar(campo: string): void { this.cfg[campo] = !this.cfg[campo]; }

  encender(): void {
    this.cfg.activo = !this.cfg.activo;
    this.guardar();
  }

  restaurar(cual: 'mensaje_inicio' | 'mensaje_fin'): void { this.cfg[cual] = this.defecto[cual]; }

  guardar(): void {
    this.guardando = true;
    const c = this.cfg;
    const datos = {
      activo: c.activo, modo: c.modo, minimo_onts: +c.minimo_onts, porcentaje: +c.porcentaje, minutos_revision: +c.minutos_revision,
      minutos_confirmacion: +c.minutos_confirmacion, minutos_resolucion: +c.minutos_resolucion, contar_cortes_de_luz: c.contar_cortes_de_luz,
      avisar_inicio: c.avisar_inicio, avisar_fin: c.avisar_fin, avisar_grupo: c.avisar_grupo, incluir_suspendidos: c.incluir_suspendidos,
      wa_linea_id: c.wa_linea_id ? +c.wa_linea_id : null, segundos_entre_mensajes: +c.segundos_entre_mensajes,
      silencio_desde: c.silencio_desde || null, silencio_hasta: c.silencio_hasta || null,
      mensaje_inicio: c.mensaje_inicio, mensaje_fin: c.mensaje_fin,
    };
    this.api.guardar(datos).subscribe({
      next: (r: any) => { this.guardando = false; this.avisar(r); this.cargar(true); },
      error: (e) => { this.guardando = false; this.avisar(e?.error ?? { error: 1, message: 'No se pudo guardar.' }); this.cargar(true); },
    });
  }

  probar(cual: 'inicio' | 'fin'): void {
    if (this.telefonoPrueba.replace(/\D/g, '').length < 10) { this.avisar({ error: 1, message: 'Escriba un celular de 10 dígitos.' }); return; }
    this.api.probar(this.telefonoPrueba, cual).subscribe({
      next: (r: any) => this.avisar(r),
      error: (e) => this.avisar(e?.error ?? { error: 1, message: 'No se pudo enviar.' }),
    });
  }

  // ── Sectores ────────────────────────────────────────────────────────────
  guardarSectores(): void {
    this.guardando = true;
    this.api.sectores(this.puertos.map(p => ({ olt_id: p.olt_id, fsp: p.fsp, nombre: (p.nombre || '').trim() || null }))).subscribe({
      next: (r: any) => { this.guardando = false; this.avisar(r); this.cargar(true); },
      error: (e) => { this.guardando = false; this.avisar(e?.error ?? { error: 1, message: 'No se pudo guardar.' }); },
    });
  }

  private avisar(r: any): void {
    const texto = r?.message || (r?.errors ? Object.values(r.errors).flat().join(' ') : '') || (r?.error ? 'No se pudo.' : 'Listo.');
    if (r?.error || r?.errors) this.toast.error(texto); else this.toast.success(texto);
  }

  trackId = (_: number, x: any) => x.id ?? x;
  trackPuerto = (_: number, p: any) => p.olt_id + '|' + p.fsp;
}
