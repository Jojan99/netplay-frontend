import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NpSelectComponent, PresentacionSelect } from '../../common/np-select/np-select.component';
import { CatalogoUbicacion, CatalogoUbicacionService, Departamento, Municipio, Pais, normalizar } from '../../services/catalogo-ubicacion.service';

/** Los campos de ubicación del cliente, con los mismos nombres en el alta y en la ficha. */
export interface DatosDeUbicacion {
  pais?: string | null;
  departamento?: string | null;
  ciudad?: string | null;
  municipio?: string | null;
  prefijo_telefono?: string | null;
}

/**
 * País, departamento, ciudad, municipio (código DANE) e indicativo, elegidos de listas con
 * buscador en vez de escritos a mano.
 *
 * Van encadenados: el país propone su indicativo; el departamento acota las ciudades; la
 * ciudad pone sola su código DANE, y buscar el código (o el nombre) en el municipio llena
 * departamento y ciudad. Fuera de Colombia no hay códigos DANE: departamento y ciudad
 * quedan como texto libre y el municipio no se pide.
 *
 * Escribe directo sobre el objeto que recibe (el borrador del alta o el formulario de la
 * ficha) y avisa con (cambio) para que el dueño guarde.
 */
@Component({
  selector: 'app-ubicacion-cliente',
  standalone: true,
  imports: [CommonModule, FormsModule, NpSelectComponent],
  host: { style: 'display: contents' },
  template: `
    <label class="np-field"><span>País</span>
      <np-select [ngModel]="datos.pais" (ngModelChange)="alElegirPais($event)" name="{{ prefijo }}_pais"
                 [opciones]="paises" [presentacion]="presPais" [cargando]="!catalogo" [buscable]="true"
                 placeholder="Seleccione el país…" textoBuscar="Buscar país…" ariaLabel="País"></np-select>
    </label>

    <ng-container *ngIf="esColombia; else libre">
      <label class="np-field"><span>Departamento</span>
        <np-select [ngModel]="datos.departamento" (ngModelChange)="alElegirDepartamento($event)" name="{{ prefijo }}_departamento"
                   [opciones]="departamentos" [presentacion]="presDepartamento" [cargando]="!catalogo" [buscable]="true"
                   placeholder="Seleccione el departamento…" textoBuscar="Buscar departamento…" ariaLabel="Departamento"></np-select>
      </label>
      <label class="np-field"><span>Ciudad</span>
        <np-select [ngModel]="datos.ciudad" (ngModelChange)="alElegirCiudad($event)" name="{{ prefijo }}_ciudad"
                   [opciones]="ciudades" [presentacion]="presCiudad" [cargando]="!catalogo" [buscable]="true"
                   [placeholder]="datos.departamento ? 'Seleccione la ciudad…' : 'Primero el departamento'"
                   [textoSinOpciones]="datos.departamento ? 'No hay ciudades.' : 'Elija primero el departamento.'"
                   textoBuscar="Buscar ciudad…" ariaLabel="Ciudad"></np-select>
      </label>
      <label class="np-field"><span>Municipio <em>código DANE</em></span>
        <np-select [ngModel]="datos.municipio" (ngModelChange)="alElegirMunicipio($event)" name="{{ prefijo }}_municipio"
                   [opciones]="municipios" [presentacion]="presMunicipio" [cargando]="!catalogo" [buscable]="true" [limite]="80"
                   placeholder="Busque por código o por nombre…" textoBuscar="Código DANE o nombre del municipio…" ariaLabel="Municipio, código DANE"></np-select>
      </label>
    </ng-container>
    <ng-template #libre>
      <label class="np-field"><span>Departamento <em>o estado</em></span>
        <input type="text" class="np-input" [(ngModel)]="datos.departamento" (ngModelChange)="avisar()" name="{{ prefijo }}_departamento_libre" maxlength="80" /></label>
      <label class="np-field"><span>Ciudad</span>
        <input type="text" class="np-input" [(ngModel)]="datos.ciudad" (ngModelChange)="avisar()" name="{{ prefijo }}_ciudad_libre" maxlength="80" /></label>
    </ng-template>

    <label class="np-field"><span>Indicativo del teléfono</span>
      <np-select [ngModel]="datos.prefijo_telefono" (ngModelChange)="alElegirIndicativo($event)" name="{{ prefijo }}_prefijo"
                 [opciones]="paises" [presentacion]="presIndicativo" [cargando]="!catalogo" [buscable]="true"
                 placeholder="Seleccione el indicativo…" textoBuscar="Buscar por país o por número…" ariaLabel="Indicativo del teléfono"></np-select>
    </label>
    <p class="np-notice np-notice--danger np-field-full" *ngIf="fallo">No se pudo cargar la lista de países y municipios. Recargue la página.</p>
  `,
})
export class UbicacionClienteComponent implements OnInit, OnChanges {
  private catalogos = inject(CatalogoUbicacionService);
  private cdr = inject(ChangeDetectorRef);

  /** El objeto donde se escriben los campos (se modifica en el lugar). */
  @Input({ required: true }) datos!: DatosDeUbicacion;
  /** Para que los name de los campos no choquen si hay dos formularios en la misma página. */
  @Input() prefijo = 'ub';
  @Output() cambio = new EventEmitter<void>();

  catalogo: CatalogoUbicacion | null = null;
  fallo = false;
  paises: Pais[] = [];
  departamentos: Departamento[] = [];
  municipios: Municipio[] = [];
  /** Las ciudades del departamento elegido. Se recalcula al cambiar, nunca en la plantilla. */
  ciudades: Municipio[] = [];
  esColombia = true;

  readonly presPais: PresentacionSelect<Pais> = {
    valor: p => p.nombre,
    etiqueta: p => p.nombre,
    detalle: p => '+' + p.indicativo,
    buscarEn: p => `${p.nombre} ${p.iso} ${p.indicativo}`,
  };
  readonly presDepartamento: PresentacionSelect<Departamento> = {
    valor: d => d.nombre,
    etiqueta: d => d.nombre,
    prefijo: d => d.codigo,
    buscarEn: d => `${d.nombre} ${d.codigo}`,
  };
  readonly presCiudad: PresentacionSelect<Municipio> = {
    valor: m => m.nombre,
    etiqueta: m => m.nombre,
    prefijo: m => m.codigo,
    buscarEn: m => `${m.nombre} ${m.codigo}`,
  };
  readonly presMunicipio: PresentacionSelect<Municipio> = {
    valor: m => m.codigo,
    etiqueta: m => m.nombre,
    prefijo: m => m.codigo,
    detalle: m => m.nombreDepartamento,
    buscarEn: m => `${m.codigo} ${m.nombre} ${m.nombreDepartamento}`,
    // Quien escribe el código exacto lo quiere a él primero.
    relevancia: (m, q) => (m.codigo === q.trim() ? 3 : m.codigo.startsWith(q.trim()) ? 2 : normalizar(m.nombre).startsWith(normalizar(q)) ? 1 : 0),
  };
  readonly presIndicativo: PresentacionSelect<Pais> = {
    valor: p => p.indicativo,
    etiqueta: p => '+' + p.indicativo,
    detalle: p => p.nombre,
    buscarEn: p => `+${p.indicativo} ${p.indicativo} ${p.nombre} ${p.iso}`,
  };

  ngOnInit(): void {
    this.catalogos.cargar().then(c => {
      this.catalogo = c;
      this.paises = c.paises;
      this.departamentos = c.departamentos;
      this.municipios = c.municipios;
      this.ajustarALoGuardado();
      this.cdr.markForCheck();
    }).catch(() => { this.fallo = true; this.cdr.markForCheck(); });
  }

  /** Cambió el objeto (otro cliente, o el alta se reinició): volver a leerlo. */
  ngOnChanges(): void {
    if (this.catalogo) this.ajustarALoGuardado();
  }

  /**
   * Lleva lo guardado a los nombres del catálogo: hay clientes con «SOLEDAD», «Atlantico» o
   * sólo el código. Sin esto el selector los mostraba como texto suelto y la ciudad no se
   * encontraba en la lista del departamento.
   */
  private ajustarALoGuardado(): void {
    const c = this.catalogo!;
    const d = this.datos;
    if (!d) return;

    const pais = d.pais ? c.paises.find(p => normalizar(p.nombre) === normalizar(d.pais) || normalizar(p.iso) === normalizar(d.pais)) : null;
    if (pais) d.pais = pais.nombre;
    this.esColombia = !d.pais || normalizar(d.pais) === 'colombia';

    if (this.esColombia) {
      const porCodigo = d.municipio ? c.municipios.find(m => m.codigo === String(d.municipio).padStart(5, '0')) : null;
      const dep = d.departamento ? c.departamentos.find(x => normalizar(x.nombre) === normalizar(d.departamento)) : null;

      if (dep) d.departamento = dep.nombre;
      else if (porCodigo && !d.departamento) d.departamento = porCodigo.nombreDepartamento;

      const codigoDep = c.departamentos.find(x => x.nombre === d.departamento)?.codigo;
      const ciudad = d.ciudad && codigoDep ? c.municipios.find(m => m.departamento === codigoDep && normalizar(m.nombre) === normalizar(d.ciudad)) : null;
      if (ciudad) d.ciudad = ciudad.nombre;
      else if (porCodigo && !d.ciudad) d.ciudad = porCodigo.nombre;
      if (porCodigo) d.municipio = porCodigo.codigo;
      // Tiene ciudad pero no código: el código sale de la ciudad.
      if (!d.municipio && ciudad) d.municipio = ciudad.codigo;
    }

    this.recalcularCiudades();
  }

  private recalcularCiudades(): void {
    const codigo = this.catalogo?.departamentos.find(x => x.nombre === this.datos?.departamento)?.codigo;
    this.ciudades = codigo ? (this.catalogo?.municipios.filter(m => m.departamento === codigo) ?? []) : [];
  }

  alElegirPais(nombre: string | null): void {
    const antes = this.esColombia;
    this.datos.pais = nombre;
    this.esColombia = !nombre || normalizar(nombre) === 'colombia';
    const pais = this.paises.find(p => p.nombre === nombre);
    if (pais) this.datos.prefijo_telefono = pais.indicativo;
    // El código DANE y los nombres del catálogo sólo valen para Colombia.
    if (antes !== this.esColombia) {
      this.datos.departamento = null;
      this.datos.ciudad = null;
      this.datos.municipio = null;
      this.recalcularCiudades();
    }
    this.avisar();
  }

  alElegirDepartamento(nombre: string | null): void {
    this.datos.departamento = nombre;
    this.recalcularCiudades();
    if (!this.ciudades.some(m => m.nombre === this.datos.ciudad)) {
      this.datos.ciudad = null;
      this.datos.municipio = null;
    }
    this.avisar();
  }

  alElegirCiudad(nombre: string | null): void {
    this.datos.ciudad = nombre;
    this.datos.municipio = this.ciudades.find(m => m.nombre === nombre)?.codigo ?? null;
    this.avisar();
  }

  alElegirMunicipio(codigo: string | null): void {
    this.datos.municipio = codigo;
    const m = this.municipios.find(x => x.codigo === codigo);
    if (m) {
      this.datos.departamento = m.nombreDepartamento;
      this.datos.ciudad = m.nombre;
      this.recalcularCiudades();
    }
    this.avisar();
  }

  alElegirIndicativo(indicativo: string | null): void {
    this.datos.prefijo_telefono = indicativo;
    this.avisar();
  }

  avisar(): void {
    this.cambio.emit();
  }
}
