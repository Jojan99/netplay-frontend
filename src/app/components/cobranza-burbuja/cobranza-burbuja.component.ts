import { Component, OnDestroy, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { CobranzaCaso, CobranzaResumen, CobranzaService } from '../../services/cobranza.service';

type Grupo = 'atencion' | 'curso' | 'resultados';

/**
 * Cobranza en el panel: una pastilla discreta abajo a la izquierda que sólo
 * aparece cuando hay algo (clientes para autorizar, conversaciones que el
 * asistente pasó a una persona, acuerdos o pagos nuevos). Al abrirla, la
 * bandeja con cada caso y lo que se puede hacer con él.
 */
@Component({
  selector: 'app-cobranza-burbuja',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cobranza-burbuja.component.html',
  styleUrl: './cobranza-burbuja.component.scss',
})
export class CobranzaBurbujaComponent implements OnInit, OnDestroy {
  private svc = inject(CobranzaService);
  private router = inject(Router);
  private enNavegador = isPlatformBrowser(inject(PLATFORM_ID));

  readonly resumen = signal<CobranzaResumen | null>(null);
  readonly abierta = signal(false);
  readonly grupo = signal<Grupo>('atencion');
  readonly casos = signal<CobranzaCaso[]>([]);
  readonly cargando = signal(false);
  readonly detalle = signal<{ caso: any; cliente: any; mensajes: any[] } | null>(null);
  readonly ocupado = signal<number | null>(null);
  readonly aviso = signal<{ texto: string; tipo: 'ok' | 'error' } | null>(null);

  private relojResumen: ReturnType<typeof setInterval> | null = null;
  private relojLista: ReturnType<typeof setInterval> | null = null;

  trackCaso = (_: number, c: CobranzaCaso) => c.id;

  ngOnInit(): void {
    if (!this.enNavegador) return;
    this.cargarResumen();
    this.relojResumen = setInterval(() => this.cargarResumen(), 60_000);
  }

  ngOnDestroy(): void {
    if (this.relojResumen) clearInterval(this.relojResumen);
    if (this.relojLista) clearInterval(this.relojLista);
  }

  /** Lo que espera a alguien: autorizar o atender. */
  get pendientes(): number {
    const r = this.resumen();
    return r ? r.detectados + r.escalados : 0;
  }

  /** La pastilla sólo se ve si la cobranza está activa y hay algo que mirar. */
  get visible(): boolean {
    const r = this.resumen();
    return !!r?.activa && (this.pendientes > 0 || r.en_curso > 0 || r.no_vistos > 0 || this.abierta());
  }

  private cargarResumen(): void {
    this.svc.resumen().subscribe({
      next: r => this.resumen.set(r?.error === 0 || r?.status === 0 ? r.data : r?.data ?? null),
      error: () => {},   // sin permiso o sin conexión: la pastilla no aparece
    });
  }

  abrir(): void {
    this.abierta.set(true);
    this.detalle.set(null);
    this.grupo.set(this.pendientes > 0 ? 'atencion' : 'curso');
    this.cargarCasos();
    if (this.relojLista) clearInterval(this.relojLista);
    this.relojLista = setInterval(() => (this.detalle() ? this.recargarDetalle() : this.cargarCasos(true)), 20_000);
    if ((this.resumen()?.no_vistos ?? 0) > 0) this.svc.marcarVistos().subscribe({ next: () => this.cargarResumen() });
  }

  cerrar(): void {
    this.abierta.set(false);
    this.detalle.set(null);
    if (this.relojLista) { clearInterval(this.relojLista); this.relojLista = null; }
  }

  elegirGrupo(g: Grupo): void {
    this.grupo.set(g);
    this.detalle.set(null);
    this.cargarCasos();
  }

  private cargarCasos(silencioso = false): void {
    if (!silencioso) this.cargando.set(true);
    this.svc.casos(this.grupo()).subscribe({
      next: r => { this.cargando.set(false); this.casos.set(r?.data ?? []); },
      error: () => { this.cargando.set(false); },
    });
  }

  verCaso(c: CobranzaCaso): void {
    this.ocupado.set(c.id);
    this.svc.caso(c.id).subscribe({
      next: r => { this.ocupado.set(null); this.detalle.set(r?.data ?? null); },
      error: () => { this.ocupado.set(null); this.mostrar('No se pudo abrir el caso.', 'error'); },
    });
  }

  private recargarDetalle(): void {
    const id = this.detalle()?.caso?.id;
    if (!id) return;
    this.svc.caso(id).subscribe({ next: r => this.detalle.set(r?.data ?? this.detalle()) });
  }

  volver(): void {
    this.detalle.set(null);
    this.cargarCasos();
  }

  hacer(c: { id: number }, que: 'autorizar' | 'descartar' | 'tomar' | 'devolver'): void {
    if (que === 'descartar' && !confirm('¿Descartar este caso? No se le escribe y no vuelve a aparecer por unos días.')) return;
    if (que === 'tomar' && !confirm('El asistente deja de contestarle y la conversación queda para el equipo en el CRM. ¿Continuar?')) return;

    this.ocupado.set(c.id);
    this.svc.accion(c.id, que).subscribe({
      next: r => {
        this.ocupado.set(null);
        const ok = (r?.error ?? r?.status) === 0;
        this.mostrar(r?.message ?? (ok ? 'Listo.' : 'No se pudo.'), ok ? 'ok' : 'error');
        if (ok) {
          this.cargarResumen();
          if (this.detalle()) this.recargarDetalle(); else this.cargarCasos(true);
          if (que === 'tomar' && this.detalle()?.caso?.conversation_id) this.irAlChat(this.detalle()!.caso.conversation_id);
        }
      },
      error: () => { this.ocupado.set(null); this.mostrar('No se pudo completar la acción.', 'error'); },
    });
  }

  irAlChat(conversationId: number | null): void {
    if (!conversationId) return;
    this.router.navigateByUrl(`/dashboard/crm/inbox/${conversationId}`);
  }

  irALaFicha(userId: number): void {
    this.router.navigateByUrl(`/dashboard/usuario?cliente=${userId}`);
  }

  irAConfig(): void {
    this.router.navigateByUrl('/dashboard/cobranza');
    this.cerrar();
  }

  private mostrar(texto: string, tipo: 'ok' | 'error'): void {
    this.aviso.set({ texto, tipo });
    setTimeout(() => { if (this.aviso()?.texto === texto) this.aviso.set(null); }, 6000);
  }

  // ── Para mostrar ──────────────────────────────────────────────────────

  nombre(c: { names?: string; lastname?: string }): string {
    return `${c.names ?? ''} ${c.lastname ?? ''}`.trim() || 'Cliente';
  }

  pesos(v: number | string | null | undefined): string {
    return '$' + Math.round(Number(v) || 0).toLocaleString('es-CO');
  }

  readonly ESTADOS: Record<string, { texto: string; tono: string }> = {
    detectado:     { texto: 'Para autorizar',     tono: 'aviso' },
    escalado:      { texto: 'Necesita una persona', tono: 'peligro' },
    autorizado:    { texto: 'Por escribirle',     tono: 'info' },
    contactado:    { texto: 'Esperando respuesta', tono: 'info' },
    negociando:    { texto: 'Conversando',        tono: 'info' },
    acuerdo:       { texto: 'Acuerdo',            tono: 'ok' },
    pagado:        { texto: 'Pagó',               tono: 'ok' },
    descartado:    { texto: 'Descartado',         tono: 'neutro' },
    sin_respuesta: { texto: 'No respondió',       tono: 'neutro' },
    cerrado:       { texto: 'Cerrado',            tono: 'neutro' },
  };

  readonly RESULTADOS: Record<string, string> = {
    compromiso: 'Compromiso de pago',
    pagado: 'Pagó',
    numero_equivocado: 'Número equivocado',
    no_contactar: 'Pidió que no le escriban',
    no_desea: 'No quiere pagar',
    lo_atiende_una_persona: 'Lo atiende el equipo',
    compromiso_incumplido: 'No cumplió el compromiso',
    sin_respuesta: 'No respondió',
    descartado: 'Descartado',
  };

  estado(e: string): { texto: string; tono: string } {
    return this.ESTADOS[e] ?? { texto: e, tono: 'neutro' };
  }
}
