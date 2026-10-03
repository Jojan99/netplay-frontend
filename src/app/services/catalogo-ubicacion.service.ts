import { Injectable } from '@angular/core';

export interface Pais { iso: string; nombre: string; indicativo: string; }
export interface Departamento { codigo: string; nombre: string; }
export interface Municipio { codigo: string; nombre: string; departamento: string; nombreDepartamento: string; }

export interface CatalogoUbicacion {
  paises: Pais[];
  departamentos: Departamento[];
  municipios: Municipio[];
}

/** Minúsculas y sin tildes: «ATLÁNTICO», «Atlantico» y «atlántico» son el mismo departamento. */
export function normalizar(texto: unknown): string {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Países con su indicativo y la división política de Colombia (DIVIPOLA del DANE: 33
 * departamentos y 1.122 municipios con su código). La factura electrónica y Alegra piden
 * el municipio por código; escribirlo a mano era donde se colaban los errores.
 *
 * Son archivos estáticos (assets/catalogos) que se piden una sola vez y sólo cuando se abre
 * un formulario que los usa: no pesan en la carga inicial del panel.
 */
@Injectable({ providedIn: 'root' })
export class CatalogoUbicacionService {
  private pedido: Promise<CatalogoUbicacion> | null = null;

  cargar(): Promise<CatalogoUbicacion> {
    this.pedido ??= Promise.all([
      fetch('assets/catalogos/paises.json').then(r => r.json()),
      fetch('assets/catalogos/divipola.json').then(r => r.json()),
    ]).then(([p, d]) => {
      const departamentos: Departamento[] = (d.departamentos as [string, string][]).map(([codigo, nombre]) => ({ codigo, nombre }));
      const nombres = new Map(departamentos.map(x => [x.codigo, x.nombre]));
      return {
        paises: (p.paises as [string, string, string][]).map(([iso, nombre, indicativo]) => ({ iso, nombre, indicativo })),
        departamentos,
        municipios: (d.municipios as [string, string, string][]).map(([codigo, nombre, departamento]) =>
          ({ codigo, nombre, departamento, nombreDepartamento: nombres.get(departamento) ?? '' })),
      };
    }).catch(e => { this.pedido = null; throw e; });

    return this.pedido;
  }
}
