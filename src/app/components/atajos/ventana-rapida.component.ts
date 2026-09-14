import { Component, Input, OnChanges, OnInit, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AtajosService, VentanaRapida } from '../../services/atajos.service';
import { OltService } from '../../services/olt.service';
import { AlertasService } from '../../services/alertas.service';
import { UserService } from '../../services/user.service';
import { ToastService } from '../../services/toast.service';
import { SelectorDeClienteComponent } from './selector-de-cliente.component';

/** El contenido de una ventana rápida según su tipo. */
@Component({
  selector: 'app-ventana-rapida',
  standalone: true,
  imports: [CommonModule, FormsModule, SelectorDeClienteComponent],
  templateUrl: './ventana-rapida.component.html',
  styleUrls: ['./atajos.scss', './ventana-rapida.component.scss'],
})
export class VentanaRapidaComponent implements OnInit, OnChanges {
  @Input({ required: true }) ventana!: VentanaRapida;

  readonly atajos = inject(AtajosService);
  private router = inject(Router);
  private olt = inject(OltService);
  private alertasSvc = inject(AlertasService);
  private users = inject(UserService);
  private toast = inject(ToastService);

  cargando = false;
  error = '';
  ficha: any = null;
  equipo: any = null;
  alertas: any[] = [];
  resumenAlertas: any = null;

  // Ticket
  tipos: any[] = [];
  prioridades: any[] = [];
  tecnicos: any[] = [];
  ticket = { tipo: 0, prioridad: 0, tecnico: 0, fecha: '', observacion: '', avisar: true };
  creando = false;

  ngOnInit(): void {
    if (this.ventana.tipo === 'alertas') this.cargarAlertas();
    if (this.ventana.tipo === 'ticket') this.cargarCatalogos();
  }

  ngOnChanges(c: SimpleChanges): void {
    const antes = c['ventana']?.previousValue?.cliente?.id;
    const ahora = this.ventana.cliente?.id;
    if (c['ventana']?.firstChange || antes !== ahora) this.cargarCliente();
  }

  elegirCliente(c: any): void {
    this.atajos.ponerCliente(this.ventana.id, { id: c.id, nombre: c.nombre });
  }

  private cargarCliente(): void {
    this.ficha = null;
    this.equipo = null;
    this.error = '';
    const id = this.ventana.cliente?.id;
    if (!id || this.ventana.tipo === 'alertas') return;

    if (this.ventana.tipo === 'equipo') { this.medir(false); return; }

    this.cargando = true;
    this.atajos.cliente(id).subscribe({
      next: res => { if (this.ventana.cliente?.id !== id) return; this.cargando = false; this.ficha = res?.data ?? null; },
      error: e => { this.cargando = false; this.error = this.explicar(e, 'No se pudo leer el cliente.'); },
    });
  }

  // ── Equipo ──────────────────────────────────────────────────────────

  medir(refrescar: boolean): void {
    const id = this.ventana.cliente?.id;
    if (!id) return;
    this.cargando = true;
    this.error = '';
    this.olt.ontEnVivo(id, refrescar).subscribe({
      next: res => {
        if (this.ventana.cliente?.id !== id) return;
        this.cargando = false;
        this.equipo = res?.data ?? null;
        if (!this.equipo) this.error = res?.message || 'Sin equipo ONT asignado.';
      },
      error: e => { this.cargando = false; this.error = this.explicar(e, 'No se pudo consultar la ONT.'); },
    });
  }

  get enLinea(): boolean { return /online/i.test(this.equipo?.vivo?.status ?? ''); }

  etiquetaSenal(estado: string | null | undefined): string {
    return ({ buena: 'buena', regular: 'regular', baja: 'baja', critica: 'crítica', saturada: 'saturada', sin_senal: 'sin señal' } as any)[estado ?? ''] ?? 'sin dato';
  }

  tonoSenal(estado: string | null | undefined): string {
    return ({ buena: 'ok', regular: 'warn', baja: 'warn', critica: 'danger', saturada: 'danger', sin_senal: 'danger' } as any)[estado ?? ''] ?? 'muted';
  }

  /** −30 dBm vacío, −8 lleno: la barra ubica la señal entre lo crítico y lo saturado. */
  anchoSenal(p: number | null | undefined): number {
    if (p === null || p === undefined) return 0;
    return Math.round(Math.min(1, Math.max(0, (p + 30) / 22)) * 100);
  }

  // ── Ticket ──────────────────────────────────────────────────────────

  private cargarCatalogos(): void {
    this.ticket.fecha = new Date().toISOString().substring(0, 10);
    this.users.getServiceTicket().subscribe({ next: r => this.tipos = r?.data ?? [] });
    this.users.getPriorityTicket().subscribe({ next: r => this.prioridades = r?.data ?? [] });
    this.users.getTechnicaAll().subscribe({ next: r => this.tecnicos = r?.data ?? [] });
  }

  get ticketListo(): boolean {
    const t = this.ticket;
    return !!this.ficha && +t.tipo > 0 && +t.prioridad > 0 && +t.tecnico > 0 && !!t.fecha && t.observacion.trim().length > 0;
  }

  crearTicket(): void {
    if (!this.ticketListo || this.creando) return;
    const tecnico = this.tecnicos.find(x => +x.user_id === +this.ticket.tecnico);
    this.creando = true;

    this.atajos.crearTicket({
      user_id: this.ficha.id,
      address: this.ficha.direccion || 'Sin dirección',
      cedula: this.ficha.dni,
      phone: this.ficha.telefono,
      date: this.ticket.fecha,
      type_service: +this.ticket.tipo,
      priority: +this.ticket.prioridad,
      tecnichal: +this.ticket.tecnico,
      observation: this.ticket.observacion.trim(),
      client_name: this.ficha.nombre,
      technician_name: tecnico ? `${tecnico.names} ${tecnico.lastname}` : '',
      notify_group: this.ticket.avisar,
    }).subscribe({
      next: (res: any) => {
        this.creando = false;
        if (res?.status || res?.error) { this.toast.error(res?.message || 'No se pudo crear el ticket.'); return; }
        this.toast.success(`Ticket creado para ${this.ficha.nombre}. El diagnóstico queda en sus novedades.`);
        this.ticket.observacion = '';
        this.atajos.cerrar(this.ventana.id);
      },
      error: e => { this.creando = false; this.toast.error(this.explicar(e, 'No se pudo crear el ticket.')); },
    });
  }

  // ── Alertas ─────────────────────────────────────────────────────────

  cargarAlertas(): void {
    this.cargando = true;
    this.error = '';
    this.alertasSvc.lista().subscribe({
      next: (res: any) => {
        this.cargando = false;
        this.alertas = (res?.data?.alertas ?? []).slice(0, 15);
        this.resumenAlertas = res?.data?.resumen ?? null;
      },
      error: e => { this.cargando = false; this.error = this.explicar(e, 'No se pudieron leer las alertas.'); },
    });
  }

  tonoAlerta(nivel: string): string { return /crit/i.test(nivel || '') ? 'danger' : 'warn'; }

  // ── Comunes ─────────────────────────────────────────────────────────

  tonoEstado(estado: string | null | undefined): string {
    const e = (estado || '').toLowerCase();
    if (/activ|active/.test(e)) return 'ok';
    if (/cort|suspend|retir|inact/.test(e)) return 'danger';
    return 'warn';
  }

  dinero(n: number | null | undefined): string {
    return '$ ' + Math.round(n ?? 0).toLocaleString('es-CO');
  }

  diasVencida(fecha: string): number {
    return Math.max(0, Math.floor((Date.now() - new Date(fecha + 'T00:00:00').getTime()) / 86400000));
  }

  verFicha(): void {
    const id = this.ventana.cliente?.id;
    if (id) this.router.navigate(['/dashboard/usuario'], { queryParams: { cliente: id, tab: 'servicios' } });
  }

  abrir(tipo: 'equipo' | 'ticket' | 'facturas' | 'cliente'): void {
    this.atajos.abrirVentana(tipo, this.ventana.cliente);
  }

  verPuerto(fsp: string): void {
    this.router.navigate(['/dashboard/olt/online'], { queryParams: { puerto: fsp } });
  }

  ir(ruta: string): void { this.router.navigate([ruta]); }

  abrirPdf(url: string): void { window.open(url, '_blank', 'noopener'); }

  async copiar(texto: string, aviso: string): Promise<void> {
    try { await navigator.clipboard.writeText(texto); this.toast.success(aviso); }
    catch { this.toast.error('El navegador no dejó copiar el enlace.'); }
  }

  private explicar(e: any, porDefecto: string): string {
    if (e?.status === 403) return 'Tu perfil no tiene acceso a esta consulta.';
    if (e?.status === 404) return 'No se encontró en tu empresa.';
    return e?.error?.message || porDefecto;
  }
}
