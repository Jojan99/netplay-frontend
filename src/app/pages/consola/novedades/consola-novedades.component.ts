import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConsolaService } from '../../../services/consola.service';
import { ToastService } from '../../../services/toast.service';
import { DialogService } from '../../../services/dialog.service';

interface Novedad {
  id?: number;
  titulo: string;
  detalle: string;
  tipo: 'nuevo' | 'mejora' | 'arreglo';
  modulo: string | null;
  ruta: string | null;
  publicada_en?: string | null;
  escrita_por?: string | null;
}

/**
 * Novedades: lo que Netvula le muestra a las empresas en su panel.
 *
 * Nacen en borrador y no las ve nadie hasta publicarlas. Si se les pone un
 * módulo, sólo las ven las empresas que lo tienen.
 */
@Component({
  selector: 'app-consola-novedades',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './consola-novedades.component.html',
  styleUrl: './consola-novedades.component.scss',
})
export class ConsolaNovedadesComponent implements OnInit {
  private consola = inject(ConsolaService);
  private toast = inject(ToastService);
  private dialog = inject(DialogService);

  cargando = true;
  guardando = false;
  lista: Novedad[] = [];
  editando: Novedad | null = null;

  readonly TIPOS = [
    { v: 'nuevo', t: 'Nuevo' },
    { v: 'mejora', t: 'Mejora' },
    { v: 'arreglo', t: 'Arreglo' },
  ];

  /** Los módulos a los que se puede atar una novedad. */
  readonly MODULOS = ['', 'finanzas', 'usuario', 'olt-admin', 'crm', 'inventory', 'mikrotik', 'staff', 'router'];

  ngOnInit(): void { this.cargar(); }

  cargar(): void {
    this.cargando = true;
    this.consola.novedades().subscribe({
      next: r => { this.cargando = false; this.lista = r?.data ?? []; },
      error: () => { this.cargando = false; this.toast.error('No se pudieron cargar las novedades.'); },
    });
  }

  nueva(): void {
    this.editando = { titulo: '', detalle: '', tipo: 'nuevo', modulo: '', ruta: '' };
  }

  editar(n: Novedad): void {
    this.editando = { ...n, modulo: n.modulo ?? '', ruta: n.ruta ?? '' };
  }

  guardar(): void {
    const n = this.editando;
    if (!n || this.guardando) return;

    if (!n.titulo.trim() || !n.detalle.trim()) {
      this.toast.warning('Falta el título o el detalle.');
      return;
    }

    this.guardando = true;
    const datos = { ...n, modulo: n.modulo || null, ruta: n.ruta || null };
    const peticion = n.id ? this.consola.guardarNovedad(n.id, datos) : this.consola.crearNovedad(datos);

    peticion.subscribe({
      next: r => {
        this.guardando = false;
        this.toast.success(r?.message ?? 'Guardada.');
        this.editando = null;
        this.cargar();
      },
      error: e => {
        this.guardando = false;
        this.toast.error(e?.error?.message ?? 'No se pudo guardar.');
      },
    });
  }

  async publicar(n: Novedad): Promise<void> {
    const publicar = !n.publicada_en;

    if (publicar && !(await this.dialog.confirm({
      titulo: 'Publicar la novedad',
      mensaje: `«${n.titulo}» va a aparecer en el panel de todas las empresas${n.modulo ? ' con el módulo ' + n.modulo : ''}. ¿Publicar?`,
      aceptar: 'Publicar',
    }))) return;

    this.consola.publicarNovedad(n.id!, publicar).subscribe({
      next: r => { this.toast.success(r?.message ?? 'Listo.'); this.cargar(); },
      error: () => this.toast.error('No se pudo cambiar.'),
    });
  }

  async borrar(n: Novedad): Promise<void> {
    if (!(await this.dialog.confirm({
      titulo: 'Borrar la novedad',
      mensaje: `Se borra «${n.titulo}». Esto no se puede deshacer.`,
      aceptar: 'Borrar',
      peligro: true,
    }))) return;

    this.consola.borrarNovedad(n.id!).subscribe({
      next: () => { this.toast.success('Borrada.'); this.cargar(); },
      error: () => this.toast.error('No se pudo borrar.'),
    });
  }

  get publicadas(): number { return this.lista.filter(n => n.publicada_en).length; }
  get borradores(): number { return this.lista.filter(n => !n.publicada_en).length; }
}
