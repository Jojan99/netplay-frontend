import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OltNavComponent } from '../../shared/olt-nav.component';
import { OltService } from '../../../../services/olt.service';
import { ToastService } from '../../../../services/toast.service';
import { CrmService } from '../../../../services/crm.service';
import { NpSelectComponent, PresentacionSelect } from '../../../../common/np-select/np-select.component';

/**
 * Vincular en tanda las ONT con sus clientes.
 *
 * Las ONT se autorizaron con el nombre del cliente como descripción, así que
 * el emparejado se propone solo; acá se revisa y se confirma. Nada se guarda
 * sin que alguien lo marque: una ONT en el cliente equivocado manda a un
 * técnico a otra casa.
 */
@Component({
  selector: 'app-olt-vinculos',
  standalone: true,
  imports: [CommonModule, FormsModule, NpSelectComponent, OltNavComponent],
  templateUrl: './olt-vinculos.component.html',
  styleUrls: ['../../shared/olt.scss', './olt-vinculos.component.scss', '../../shared/olt-movil.scss'],
  host: { class: 'np-console' },
})
export class OltVinculosComponent implements OnInit {
  private olt = inject(OltService);
  private crm = inject(CrmService);
  private toast = inject(ToastService);

  propuestas: any[] = [];
  resumen: any = null;

  /* ── Las que no se pueden adivinar ─────────────────────────────────────
     Sin descripción en la OLT no hay con qué emparejarlas: las 55 de la
     CDATA son así. Antes sólo se contaban y no se mostraban, y la ficha de
     esos clientes decía «sin equipo asignado» aunque la ONT estuviera ahí. */
  huerfanas: any[] = [];
  elegido: Record<number, any> = {};
  buscando: Record<number, string> = {};
  resultados: Record<number, any[]> = {};
  buscandoAhora: Record<number, boolean> = {};
  cargando = false;
  guardando = false;
  error = '';

  filtro: 'todas' | 'alta' | 'revisar' = 'todas';
  buscar = '';
  marcadas: Record<number, boolean> = {};

  /**
   * Clientes con el mismo nombre: la dirección es lo que los distingue (el
   * aviso de abajo pide mirarla y antes no se veía). En el modelo queda el user_id.
   */
  readonly presCandidatos: PresentacionSelect = {
    valor: c => c?.user_id,
    etiqueta: c => c?.nombre ?? '',
    detalle: c => [c?.documento ? `CC ${c.documento}` : null, c?.direccion].filter(Boolean).join(' · ') || null,
    buscarEn: c => [c?.nombre, c?.documento, c?.direccion].filter(Boolean).join(' '),
  };

  ngOnInit() { this.cargar(); }

  cargar() {
    this.cargando = true;
    this.error = '';
    this.olt.propuestasDeVinculo().subscribe({
      next: (r: any) => {
        this.cargando = false;
        if (r?.error !== 0) { this.error = r?.message || 'No se pudieron calcular las propuestas.'; return; }
        this.propuestas = r.data?.propuestas ?? [];
        this.huerfanas = r.data?.huerfanas ?? [];
        this.resumen = r.data?.resumen ?? null;
        // Las de confianza alta vienen marcadas: son las que casi siempre se aplican.
        this.marcadas = {};
        this.propuestas.filter(p => p.confianza === 'alta' && !p.cliente.ya_tiene_ont && !p.equipo_anterior)
          .forEach(p => this.marcadas[p.ont.id] = true);
      },
      error: () => { this.cargando = false; this.error = 'No se pudieron calcular las propuestas.'; },
    });
  }

  get visibles(): any[] {
    const t = this.buscar.trim().toLowerCase();

    return this.propuestas.filter(p => {
      if (this.filtro === 'alta' && p.confianza !== 'alta') return false;
      if (this.filtro === 'revisar' && p.confianza === 'alta') return false;
      if (!t) return true;
      return [p.ont.description, p.ont.serial, p.ont.fsp, p.cliente.nombre, p.cliente.documento]
        .some(v => (v ?? '').toString().toLowerCase().includes(t));
    });
  }

  get cuantasMarcadas(): number { return Object.values(this.marcadas).filter(Boolean).length; }

  marcarVisibles(valor: boolean) { this.visibles.forEach(p => this.marcadas[p.ont.id] = valor); }

  /** Por id, para que escribir en un campo no vuelva a dibujar toda la tabla. */
  porOnt = (_: number, o: any) => o.id;

  /** Busca el cliente para una ONT que nadie pudo emparejar. */
  buscarCliente(ont: any) {
    const q = (this.buscando[ont.id] || '').trim();
    if (q.length < 3) { this.toast.error('Escribí al menos 3 letras.'); return; }

    this.buscandoAhora[ont.id] = true;
    this.crm.buscarClienteParaVincular(q).subscribe({
      next: (r: any) => {
        this.buscandoAhora[ont.id] = false;
        this.resultados[ont.id] = r?.data ?? [];
        if (!this.resultados[ont.id].length) { this.toast.error('Ningún cliente coincide.'); }
      },
      error: () => { this.buscandoAhora[ont.id] = false; this.toast.error('No se pudo buscar.'); },
    });
  }

  elegirCliente(ont: any, cliente: any) {
    this.elegido[ont.id] = cliente;
    this.resultados[ont.id] = [];
    this.buscando[ont.id] = cliente.nombre;
  }

  /** Guarda los vínculos armados a mano. */
  vincularHuerfanas() {
    const pares = this.huerfanas
      .filter(o => this.elegido[o.id])
      .map(o => ({ ont: o.id, user_id: this.elegido[o.id].user_id }));

    if (!pares.length) { this.toast.error('No elegiste ningún cliente.'); return; }

    this.guardando = true;
    this.olt.aplicarVinculos(pares).subscribe({
      next: (r: any) => {
        this.guardando = false;
        if (r?.error !== 0) { this.toast.error(r?.message || 'No se pudo vincular.'); return; }
        this.toast.success(r.message);
        this.elegido = {}; this.buscando = {}; this.resultados = {};
        this.cargar();
      },
      error: () => { this.guardando = false; this.toast.error('No se pudo vincular.'); },
    });
  }

  vincular() {
    const pares = this.propuestas
      .filter(p => this.marcadas[p.ont.id])
      .map(p => ({ ont: p.ont.id, user_id: p.cliente.user_id }));

    if (!pares.length) { this.toast.error('No hay ninguna marcada.'); return; }

    this.guardando = true;
    this.olt.aplicarVinculos(pares).subscribe({
      next: (r: any) => {
        this.guardando = false;
        if (r?.error !== 0) { this.toast.error(r?.message || 'No se pudo vincular.'); return; }
        this.toast.success(r.message);
        (r.data?.errores ?? []).slice(0, 3).forEach((e: string) => this.toast.error(e));
        this.cargar();
      },
      error: () => { this.guardando = false; this.toast.error('No se pudo vincular.'); },
    });
  }
}
