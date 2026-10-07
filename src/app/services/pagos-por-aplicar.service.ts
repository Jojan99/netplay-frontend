import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface PagosDelCliente {
  /** Comprobantes esperando en la auditoría. */
  total: number;
  /** Cuándo llegó el más reciente. */
  ultimo: string | null;
  /** Cuándo llegó el más viejo: si pasa de un día, la burbuja se pone ámbar. */
  desde: string | null;
}

/**
 * Qué clientes tienen un comprobante de pago esperando en la auditoría.
 *
 * Igual que TicketsAbiertosService: UNA consulta para toda la pantalla, que la
 * lista de clientes y la ficha leen para pintar la burbuja de pago. El
 * comprobante en sí lo pide la burbuja al pasar el mouse.
 *
 * Solo administración y contabilidad pueden ver comprobantes: a los demás el
 * backend les contesta 403, el mapa queda vacío y la burbuja no aparece.
 */
@Injectable({ providedIn: 'root' })
export class PagosPorAplicarService {
  private http = inject(HttpClient);

  readonly mapa = signal<Record<number, PagosDelCliente>>({});

  private pedidoEn = 0;
  private pidiendo = false;

  private readonly VIGENCIA = 60_000;

  /** Se puede llamar en cada `ngOnInit`: si está fresco no sale a la red. */
  cargar(forzar = false): void {
    if (this.pidiendo) return;
    if (!forzar && Date.now() - this.pedidoEn < this.VIGENCIA) return;

    this.pidiendo = true;

    this.http.get<any>(`${environment.rootUrl}api/payment-proofs/por-aplicar`, {
      headers: new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` }),
    }).subscribe({
      next: r => {
        this.pidiendo = false;
        this.pedidoEn = Date.now();
        const d = r?.data;
        this.mapa.set(Array.isArray(d) ? {} : (d ?? {}));
      },
      error: () => { this.pidiendo = false; this.pedidoEn = Date.now(); },
    });
  }

  de(userId: number | null | undefined): PagosDelCliente | null {
    if (!userId) return null;
    return this.mapa()[userId] ?? null;
  }
}
