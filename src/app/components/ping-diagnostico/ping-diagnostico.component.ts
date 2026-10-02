import { ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { UserService } from '../../services/user.service';

/** Una respuesta del router, ya interpretada para pintarla. */
interface Respuesta {
  n: number;
  host: string;
  /** Milisegundos; null si no contestó. */
  ms: number | null;
  ok: boolean;
  /** Alto de su barra en la gráfica, de 12 a 100. */
  alto: number;
  texto: string;
}

type Veredicto = 'estable' | 'lento' | 'intermitente' | 'caido';

/**
 * Diagnóstico de ping a un cliente, desde su router.
 *
 * Antes era una tabla dentro de la pantalla de clientes: mostraba los tiempos en segundos
 * («0.00 s» para todo lo que respondía bien) y el estado salía de la pérdida acumulada, así que
 * después de un solo paquete perdido todas las filas siguientes decían «Intermitente» aunque
 * hubieran contestado. Ahora cada respuesta se juzga por sí misma, los tiempos van en
 * milisegundos y arriba queda el resumen que el operador necesita para hablar con el cliente:
 * si contesta, cuánto pierde y qué tan rápido.
 */
@Component({
  selector: 'app-ping-diagnostico',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ping-diagnostico.component.html',
  styleUrl: './ping-diagnostico.component.scss',
})
export class PingDiagnosticoComponent implements OnInit, OnDestroy {
  private userSvc = inject(UserService);
  private cdr = inject(ChangeDetectorRef);

  @Input() nombre = '';
  @Input({ required: true }) dni: any;
  /** La IP a la que se le va a hacer ping, para mostrarla antes de la primera respuesta. */
  @Input() ip: string | null = null;
  @Output() cerrar = new EventEmitter<void>();

  readonly cantidades = [5, 10, 20];
  cantidad = 5;

  respuestas: Respuesta[] = [];
  enviando = false;
  /** Ya se corrió al menos una vez (para distinguir «sin empezar» de «sin respuestas»). */
  corrido = false;
  error = '';

  // Resumen, calculado al llegar cada respuesta (no con getters: se pintan en cada ciclo).
  recibidos = 0;
  perdida = 0;
  promedio: number | null = null;
  minimo: number | null = null;
  maximo: number | null = null;
  veredicto: Veredicto | null = null;

  private sub: Subscription | null = null;

  ngOnInit(): void {
    // Quien abre el diagnóstico quiere el ping: arranca solo.
    this.iniciar();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  elegir(n: number): void {
    if (this.enviando) return;
    this.cantidad = n;
  }

  iniciar(): void {
    this.sub?.unsubscribe();
    this.respuestas = [];
    this.error = '';
    this.enviando = true;
    this.corrido = true;
    this.resumir();

    this.sub = this.userSvc.getPingResults(this.cantidad, this.dni).subscribe({
      next: data => {
        if (data?.message === 'done') { this.terminar(); return; }

        const p = typeof data === 'string' ? JSON.parse(data) : data;
        this.respuestas = [...this.respuestas, this.leer(p, this.respuestas.length + 1)];
        this.resumir();
        this.cdr.detectChanges();
      },
      error: () => { this.error = 'No se pudo hablar con el router. Revise que esté en línea e intente de nuevo.'; this.terminar(); },
      complete: () => this.terminar(),
    });
  }

  detener(): void {
    this.sub?.unsubscribe();
    this.terminar();
  }

  trackN = (_: number, r: Respuesta) => r.n;

  // ── Interpretación ────────────────────────────────────────────────────────

  private terminar(): void {
    this.enviando = false;
    this.resumir();
    this.cdr.detectChanges();
  }

  private leer(p: any, n: number): Respuesta {
    const ms = this.aMilisegundos(p?.time);
    // Contestó si trae tiempo y el router no lo marcó como vencido.
    const ok = ms !== null && !/timeout|unreachable|error/i.test(String(p?.status ?? ''));

    return {
      n,
      host: String(p?.host ?? this.ip ?? ''),
      ms: ok ? ms : null,
      ok,
      alto: 12,
      texto: ok ? this.formato(ms!) : 'Sin respuesta',
    };
  }

  /**
   * El tiempo como lo entrega RouterOS: «5ms», «350us», «1ms500us», «1s20ms». Antes sólo se
   * leía el primer número y se pasaba a segundos: 5 ms terminaba mostrándose como «0.00 s».
   */
  private aMilisegundos(tiempo: unknown): number | null {
    const t = String(tiempo ?? '').trim();
    if (!t) return null;

    let total = 0;
    let hubo = false;

    for (const [, valor, unidad] of t.matchAll(/([\d.]+)\s*(us|ms|s|m)/g)) {
      total += parseFloat(valor) * ({ us: 0.001, ms: 1, s: 1000, m: 60000 } as Record<string, number>)[unidad];
      hubo = true;
    }

    if (hubo) return total;

    const solo = parseFloat(t);
    return Number.isFinite(solo) ? solo : null;
  }

  formato(ms: number): string {
    if (ms < 1) return '<1 ms';
    return (ms < 10 ? ms.toFixed(1) : Math.round(ms).toString()) + ' ms';
  }

  private resumir(): void {
    const buenas = this.respuestas.filter(r => r.ok).map(r => r.ms as number);
    const total = this.respuestas.length;

    this.recibidos = buenas.length;
    this.perdida = total ? Math.round(((total - buenas.length) / total) * 100) : 0;
    this.promedio = buenas.length ? buenas.reduce((a, b) => a + b, 0) / buenas.length : null;
    this.minimo = buenas.length ? Math.min(...buenas) : null;
    this.maximo = buenas.length ? Math.max(...buenas) : null;

    // La gráfica se escala contra la respuesta más lenta (con un piso, para que 1 ms y 2 ms no
    // parezcan un abismo).
    const techo = Math.max(this.maximo ?? 0, 20);
    for (const r of this.respuestas) {
      r.alto = r.ok ? Math.max(12, Math.round(((r.ms as number) / techo) * 100)) : 100;
    }

    this.veredicto = !total ? null
      : buenas.length === 0 ? 'caido'
      : this.perdida > 0 ? 'intermitente'
      : (this.promedio as number) > 150 ? 'lento'
      : 'estable';
  }
}
