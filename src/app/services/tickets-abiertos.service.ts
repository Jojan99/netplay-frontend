import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface TicketsDelCliente {
  user_id: number;
  /** Creados y todavía sin empezar. */
  por_hacer: number;
  /** El técnico ya los arrancó. */
  en_curso: number;
  /** Desde cuándo está abierto el más viejo. */
  desde: string | null;
  /** Hasta cinco, para la tarjeta que se abre al pasar por encima del punto. */
  tickets: {
    id: number;
    status_id: number;
    servicio: string | null;
    tecnico: string | null;
    desde: string;
  }[];
}

/**
 * Qué clientes tienen un ticket sin cerrar.
 *
 * El nombre del cliente aparece en media plataforma —cartera, tickets, salud
 * de la red, avisos, clientes en riesgo— y en ninguna se veía que ese cliente
 * ya tenía una visita pedida. Así se crean dos tickets por el mismo problema,
 * y se le cobra a alguien a quien le están por ir a arreglar el servicio.
 *
 * Es UNA consulta para toda la pantalla: pedir los tickets cliente por
 * cliente serían cientos de llamadas para pintar un punto. Se guarda un
 * minuto, que es lo que dura una pantalla abierta sin que cambie nada.
 */
@Injectable({ providedIn: 'root' })
export class TicketsAbiertosService {
  private http = inject(HttpClient);

  /** Lo que sabe ahora, por user_id. Las pantallas lo leen directo. */
  readonly mapa = signal<Record<number, TicketsDelCliente>>({});

  private pedidoEn = 0;
  private pidiendo = false;

  /** Un minuto: más seguido es ruido, menos es ver un punto que ya no está. */
  private readonly VIGENCIA = 60_000;

  /**
   * Carga el mapa si hace falta. Se puede llamar en cada `ngOnInit` sin
   * miedo: si está fresco no sale a la red.
   */
  cargar(forzar = false): void {
    if (this.pidiendo) return;
    if (!forzar && Date.now() - this.pedidoEn < this.VIGENCIA) return;

    this.pidiendo = true;

    this.http.get<any>(`${environment.rootUrl}api/ticket/abiertos`, {
      headers: new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` }),
    }).subscribe({
      next: r => {
        this.pidiendo = false;
        this.pedidoEn = Date.now();
        const d = r?.data;
        // El backend devuelve un objeto por user_id; si no hay ninguno, [].
        this.mapa.set(Array.isArray(d) ? {} : (d ?? {}));
      },
      // Un punto que no se pinta no rompe la pantalla: se calla y se reintenta
      // en el próximo ciclo.
      error: () => { this.pidiendo = false; this.pedidoEn = Date.now(); },
    });
  }

  de(userId: number | null | undefined): TicketsDelCliente | null {
    if (!userId) return null;
    return this.mapa()[userId] ?? null;
  }
}
