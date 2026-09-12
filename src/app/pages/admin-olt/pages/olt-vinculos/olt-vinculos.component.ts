import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OltNavComponent } from '../../shared/olt-nav.component';
import { OltService } from '../../../../services/olt.service';
import { ToastService } from '../../../../services/toast.service';

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
  imports: [CommonModule, FormsModule, OltNavComponent],
  templateUrl: './olt-vinculos.component.html',
  styleUrls: ['../../shared/olt.scss', './olt-vinculos.component.scss'],
  host: { class: 'np-console' },
})
export class OltVinculosComponent implements OnInit {
  private olt = inject(OltService);
  private toast = inject(ToastService);

  propuestas: any[] = [];
  resumen: any = null;
  cargando = false;
  guardando = false;
  error = '';

  filtro: 'todas' | 'alta' | 'revisar' = 'todas';
  buscar = '';
  marcadas: Record<number, boolean> = {};

  ngOnInit() { this.cargar(); }

  cargar() {
    this.cargando = true;
    this.error = '';
    this.olt.propuestasDeVinculo().subscribe({
      next: (r: any) => {
        this.cargando = false;
        if (r?.error !== 0) { this.error = r?.message || 'No se pudieron calcular las propuestas.'; return; }
        this.propuestas = r.data?.propuestas ?? [];
        this.resumen = r.data?.resumen ?? null;
        // Las de confianza alta vienen marcadas: son las que casi siempre se aplican.
        this.marcadas = {};
        this.propuestas.filter(p => p.confianza === 'alta' && !p.cliente.ya_tiene_ont)
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
