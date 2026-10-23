import { ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { CodigoLeido, LectorDeCodigosComponent } from '../../components/lector-de-codigos/lector-de-codigos.component';
import { environment } from '../../../environments/environment';

interface Envio { id: number | null; codigo: string; estado: 'enviando' | 'bien' | 'mal' | 'error'; texto: string; }

/**
 * La página que abre el celular al escanear el QR de «Usar el celular» en el computador.
 *
 * Es el mismo lector de siempre, en modo continuo. Cada código se manda al computador y aquí
 * se espera su respuesta (agregado, repetido, de otro producto…) para pitar verde o rojo, como
 * si la lista estuviera en el teléfono. No pide iniciar sesión: el token del QR sólo sirve para
 * mandar códigos a esa pantalla y vence solo.
 */
@Component({
  selector: 'app-escaner-celular',
  standalone: true,
  imports: [CommonModule, LectorDeCodigosComponent],
  templateUrl: './escaner-celular.component.html',
  styleUrl: './escaner-celular.component.scss',
})
export class EscanerCelularComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild(LectorDeCodigosComponent) lector?: LectorDeCodigosComponent;

  token = '';
  cargando = true;
  error = '';
  cerrada = false;
  datos: { modo: 'serial' | 'producto'; titulo: string | null; empresa: string | null; quien: string | null } | null = null;
  envios: Envio[] = [];
  private reloj: any;

  get bien(): number { return this.envios.filter(e => e.estado === 'bien').length; }

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    this.http.get<any>(`${environment.rootUrl}api/escaner/publico/${this.token}`).subscribe({
      next: r => { this.datos = r?.data ?? null; this.cargando = false; this.sondear(); },
      error: e => {
        this.cargando = false;
        this.error = e?.error?.message || 'No se pudo conectar con el computador. Vuelva a escanear el código.';
      },
    });
  }

  ngOnDestroy(): void { clearTimeout(this.reloj); }

  enviar(c: CodigoLeido): void {
    if (this.cerrada) { this.lector?.rechazar('La sesión se cerró en el computador'); return; }

    const envio: Envio = { id: null, codigo: c.limpio || c.texto, estado: 'enviando', texto: 'Enviando…' };
    this.envios = [envio, ...this.envios].slice(0, 30);

    this.http.post<any>(`${environment.rootUrl}api/escaner/publico/${this.token}/lecturas`, { codigo: c.texto }).subscribe({
      next: r => { envio.id = r?.data?.id ?? null; this.sondear(); },
      error: e => {
        envio.estado = 'error';
        envio.texto = e?.status === 410 ? 'La sesión se cerró en el computador' : 'No se pudo enviar: revise la conexión';
        if (e?.status === 410) this.cerrada = true;
        this.lector?.rechazar(envio.texto);
        this.cdr.detectChanges();
      },
    });
  }

  /** Pregunta por las respuestas pendientes; sin pendientes, cada tanto, por si cerraron la sesión. */
  private sondear(): void {
    clearTimeout(this.reloj);
    const pendientes = this.envios.filter(e => e.estado === 'enviando' && e.id !== null).map(e => e.id);

    this.reloj = setTimeout(() => {
      this.http.get<any>(`${environment.rootUrl}api/escaner/publico/${this.token}/veredictos`, { params: { ids: pendientes.join(',') } }).subscribe({
        next: r => {
          const d = r?.data ?? {};
          for (const v of d.veredictos ?? []) {
            const e = this.envios.find(x => x.id === v.id);
            if (!e || e.estado !== 'enviando') continue;
            e.estado = v.bien ? 'bien' : 'mal';
            e.texto = v.texto || (v.bien ? 'Agregado' : 'No se agregó');
            v.bien ? this.lector?.confirmar(e.texto) : this.lector?.rechazar(e.texto);
          }
          this.cerrada = !!d.cerrada;
          this.cdr.detectChanges();
          if (!this.cerrada) this.sondear();
        },
        error: () => this.sondear(),
      });
    }, pendientes.length ? 700 : 5000);
  }
}
