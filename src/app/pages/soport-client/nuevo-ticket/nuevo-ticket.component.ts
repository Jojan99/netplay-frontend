import { Component, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { UserService } from '../../../services/user.service';
import { ToastService } from '../../../services/toast.service';
import { TicketsAbiertosService } from '../../../services/tickets-abiertos.service';
import { NpSelectComponent, PresentacionSelect } from '../../../common/np-select/np-select.component';
import { PRESENTACION_PERSONAS, conValor } from '../../../common/np-select/presentaciones';

const nombreDe = (c: any) => `${c?.names ?? ''} ${c?.lastname ?? ''}`.replace(/\s+/g, ' ').trim();
const inicialesDe = (t: string) => t.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

/**
 * Clientes: son más de mil, así que no se listan; aparecen al escribir nombre,
 * cédula, teléfono o dirección, con la cédula exacta primero.
 */
const PRESENTACION_CLIENTES: PresentacionSelect = {
  clave: c => c?.id_user,
  etiqueta: c => nombreDe(c),
  prefijo: c => inicialesDe(nombreDe(c)) || '?',
  detalle: c => [c?.dni ? `CC ${c.dni}` : null, c?.phone, c?.address].filter(Boolean).join(' · ') || null,
  buscarEn: c => [c?.names, c?.lastname, c?.dni, c?.phone, c?.address].filter(Boolean).join(' '),
  soloAlBuscar: () => true,
  relevancia: (c, q) => {
    if (String(c?.dni ?? '').startsWith(q)) return 3;
    return nombreDe(c).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').startsWith(q) ? 2 : 1;
  },
};

const PRESENTACION_SERVICIOS: PresentacionSelect = {
  valor: s => s?.id,
  etiqueta: s => s?.name ?? '',
};

interface Ping {
  host: string;
  tiempo: string;
  estado: 'ok' | 'intermitente' | 'caido';
}

/**
 * Crear ticket, en un modal dentro de la pantalla de tickets.
 *
 * Antes era una pantalla aparte del menú, en dos columnas, y al guardar volvía
 * a la lista. Ahora se crea sin salir de la lista y queda a la vista apenas se
 * guarda.
 */
@Component({
  selector: 'app-nuevo-ticket',
  standalone: true,
  imports: [CommonModule, FormsModule, NpSelectComponent],
  templateUrl: './nuevo-ticket.component.html',
  styleUrl: './nuevo-ticket.component.scss',
})
export class NuevoTicketComponent implements OnInit, OnDestroy {
  private users = inject(UserService);
  private toast = inject(ToastService);
  private ticketsAbiertos = inject(TicketsAbiertosService);

  @Output() cerrado = new EventEmitter<void>();
  @Output() creado = new EventEmitter<void>();

  /**
   * Con quién y por qué, cuando el ticket nace de otra pantalla.
   *
   * Las pantallas de red (salud, estado, avisos, clientes en riesgo) ya saben
   * a quién le pasa qué: «potencia promedio -30,5 dBm». Copiar eso a mano al
   * abrir el ticket es donde se pierde el dato —o se escribe mal— y después
   * el técnico llega sin saber qué iba a revisar.
   */
  @Input() clienteId: number | null = null;
  @Input() observacionSugerida = '';

  readonly presClientes = PRESENTACION_CLIENTES;
  readonly presServicios = PRESENTACION_SERVICIOS;
  readonly presTecnicos = conValor(PRESENTACION_PERSONAS, t => t?.user_id);

  clientes: any[] = [];
  servicios: any[] = [];
  prioridades: any[] = [];
  tecnicos: any[] = [];
  cargandoClientes = true;

  cliente: any = null;
  servicio: number | null = null;
  prioridad: number | null = null;
  tecnico: number | null = null;
  fecha = new Date().toISOString().substring(0, 10);
  observacion = '';
  /** Aviso al grupo de WhatsApp al crear (el backend avisa si no se manda). */
  avisarGrupo = true;
  guardando = false;

  ping: Ping[] = [];
  haciendoPing = false;
  private pingSub: Subscription | null = null;

  ngOnInit(): void {
    if (this.observacionSugerida) this.observacion = this.observacionSugerida;

    this.users.getAllUser().subscribe({
      next: r => {
        this.clientes = (r?.data || []).map((e: any) => ({
          id_user: e.id, names: e.names, lastname: e.lastname, address: e.address, dni: e.dni, phone: e.phone,
        }));
        this.cargandoClientes = false;

        // Viene elegido de otra pantalla: se deja puesto y con el ping hecho,
        // para que lo único que quede sea elegir técnico y prioridad.
        if (this.clienteId) {
          const ya = this.clientes.find(c => Number(c.id_user) === Number(this.clienteId));
          if (ya) this.elegirCliente(ya);
        }
      },
      error: () => { this.cargandoClientes = false; },
    });
    this.users.getServiceTicket().subscribe({ next: r => this.servicios = r?.data || [] });
    this.users.getPriorityTicket().subscribe({ next: r => this.prioridades = r?.data || [] });
    this.users.getTechnicaAll().subscribe({ next: r => this.tecnicos = r?.data || [] });
  }

  ngOnDestroy(): void {
    this.pingSub?.unsubscribe();
  }

  @HostListener('document:keydown.escape')
  alEscape(): void {
    // np-select abierto frena el Escape: sólo llega aquí si no hay nada desplegado.
    if (!this.guardando) this.cerrar();
  }

  get nombreCliente(): string { return nombreDe(this.cliente); }
  get inicialesCliente(): string { return inicialesDe(this.nombreCliente) || '?'; }

  get listo(): boolean {
    return !!this.cliente && !!this.servicio && !!this.prioridad && !!this.tecnico && this.observacion.trim().length >= 3;
  }

  /** Lo que falta, para el botón deshabilitado. */
  get faltante(): string {
    if (!this.cliente) return 'Seleccione el cliente';
    if (!this.servicio) return 'Falta el tipo de servicio';
    if (!this.tecnico) return 'Falta el técnico';
    if (!this.prioridad) return 'Falta la prioridad';
    if (this.observacion.trim().length < 3) return 'Falta la observación';
    return '';
  }

  tonoPrioridad(nombre: string): 'alta' | 'media' | 'baja' {
    const n = String(nombre ?? '').toLowerCase();
    if (n.includes('alta') || n.includes('urgente')) return 'alta';
    if (n.includes('media')) return 'media';
    return 'baja';
  }

  elegirCliente(c: any): void {
    this.cliente = c;
    this.ping = [];
    this.buscarAbiertos(c?.id_user);
  }

  cambiarCliente(): void {
    this.pingSub?.unsubscribe();
    this.haciendoPing = false;
    this.cliente = null;
    this.ping = [];
    this.abiertos = [];
  }

  /**
   * Los tickets que este cliente ya tiene sin cerrar.
   *
   * Es lo que evita el ticket repetido: alguien ve la señal baja en la
   * pantalla de red, abre el ticket, y resulta que el técnico ya va en
   * camino desde ayer por lo mismo. Se muestran antes de guardar, no después.
   */
  abiertos: any[] = [];
  buscandoAbiertos = false;

  private buscarAbiertos(userId: number | null | undefined): void {
    this.abiertos = [];
    if (!userId) return;

    this.buscandoAbiertos = true;

    this.users.getTicketsByUser(userId).subscribe({
      next: (r: any) => {
        this.buscandoAbiertos = false;
        this.abiertos = (r?.data || []).filter((t: any) => Number(t.status_id) === 1 || Number(t.status_id) === 2);
      },
      // Que no se pueda mirar el historial no impide crear el ticket.
      error: () => { this.buscandoAbiertos = false; },
    });
  }

  /** «hace 3 días»: de un ticket abierto lo que importa es cuánto lleva así. */
  desde(fecha: string): string {
    const s = Math.max(0, (Date.now() - new Date(String(fecha).replace(' ', 'T')).getTime()) / 1000);
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    return `hace ${Math.round(s / 86400)} días`;
  }

  probarConexion(): void {
    if (!this.cliente?.dni || this.haciendoPing) return;
    this.pingSub?.unsubscribe();
    this.ping = [];
    this.haciendoPing = true;

    this.pingSub = this.users.getPingResults(5, this.cliente.dni).subscribe({
      next: (data: any) => {
        if (data?.message === 'done') { this.haciendoPing = false; return; }
        const p = typeof data === 'string' ? JSON.parse(data) : data;
        const perdida = String(p?.['packet-loss'] ?? '');
        this.ping = [...this.ping, {
          host: p?.host ?? '',
          tiempo: p?.time ? String(p.time) : 'sin respuesta',
          estado: perdida === '100' ? 'caido' : perdida === '0' ? 'ok' : 'intermitente',
        }];
      },
      error: () => { this.haciendoPing = false; },
      complete: () => { this.haciendoPing = false; },
    });
  }

  get resumenPing(): string {
    if (this.haciendoPing && !this.ping.length) return 'Enviando pings al equipo del cliente…';
    const ok = this.ping.filter(p => p.estado === 'ok').length;
    if (!this.ping.length) return '';
    if (ok === this.ping.length) return `Responde bien (${ok} de ${this.ping.length})`;
    if (ok === 0) return `No responde (0 de ${this.ping.length})`;
    return `Intermitente (${ok} de ${this.ping.length})`;
  }

  crear(): void {
    if (!this.listo || this.guardando) return;
    this.guardando = true;

    const tecnico = this.tecnicos.find(t => +t.user_id === +(this.tecnico ?? 0));

    this.users.createdTicket({
      user_id: this.cliente.id_user,
      address: this.cliente.address,
      cedula: this.cliente.dni,
      phone: this.cliente.phone,
      date: this.fecha,
      type_service: this.servicio,
      priority: this.prioridad,
      tecnichal: this.tecnico,
      observation: this.observacion.trim(),
      client_name: this.nombreCliente,
      technician_name: tecnico ? nombreDe(tecnico) : '',
      notify_group: this.avisarGrupo,
    }).subscribe({
      next: (r: any) => {
        this.guardando = false;
        if (r?.error) { this.toast.error(r?.message || 'No se pudo crear el ticket.'); return; }
        this.toast.success(`Ticket creado para ${this.nombreCliente}`);
        // Para que el punto de color aparezca ya, sin esperar el minuto.
        this.ticketsAbiertos.cargar(true);
        this.creado.emit();
      },
      error: (e: any) => {
        this.guardando = false;
        this.toast.error(e?.error?.message || 'No se pudo crear el ticket.');
      },
    });
  }

  cerrar(): void {
    this.cerrado.emit();
  }
}
