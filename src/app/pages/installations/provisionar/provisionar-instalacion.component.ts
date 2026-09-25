import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InstallationService } from '../../../services/installation.service';
import { ToastService } from '../../../services/toast.service';
import { DialogService } from '../../../services/dialog.service';

/**
 * Lo que el técnico hace en la casa del cliente.
 *
 * Antes esto eran cinco pantallas y alguien en la oficina: dar de alta al
 * cliente, autorizar la ONT, asociársela, descontar el equipo y dejar el WiFi.
 * El técnico hacía la parte física y el resto quedaba para después.
 *
 * Acá elige el equipo de la lista que la OLT está viendo —sin escribir el
 * serial, y que aparezca ahí ya prueba que está conectado y encendido— y con
 * un botón queda todo hecho.
 */
@Component({
  selector: 'app-provisionar-instalacion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './provisionar-instalacion.component.html',
  styleUrl: './provisionar-instalacion.component.scss',
})
export class ProvisionarInstalacionComponent implements OnInit {
  private svc = inject(InstallationService);
  private toast = inject(ToastService);
  private dialog = inject(DialogService);

  /** La orden que el técnico está atendiendo. */
  @Input({ required: true }) orden!: any;
  @Output() cerrado = new EventEmitter<void>();
  @Output() listo = new EventEmitter<void>();

  cargando = true;
  trabajando = false;
  error = '';

  /** Las que la OLT ve sin autorizar: son las que están conectadas ahora. */
  onts: any[] = [];
  inventario: any[] = [];
  aprovisiona = false;

  elegida: any = null;
  inventoryId: number | null = null;

  /** El detalle de lo que pasó, para que el técnico vea dónde falló si falla. */
  pasos: any[] = [];
  avisos: string[] = [];
  termino = false;

  ngOnInit(): void { this.buscarEquipos(); }

  buscarEquipos(): void {
    this.cargando = true;
    this.error = '';

    this.svc.equiposDisponibles(this.orden.id).subscribe({
      next: (r: any) => {
        this.cargando = false;
        const d = r?.data ?? {};
        this.onts = d.onts ?? [];
        this.inventario = d.inventario ?? [];
        this.aprovisiona = !!d.aprovisiona;

        // Con un solo renglón de ONT en stock no hay nada que elegir.
        if (this.inventario.length === 1) this.inventoryId = this.inventario[0].id;
      },
      error: (e: any) => {
        this.cargando = false;
        this.error = e?.error?.message || 'No se pudo preguntarle a la OLT.';
      },
    });
  }

  elegir(ont: any): void {
    this.elegida = ont;
  }

  get puedeSeguir(): boolean {
    return !!this.elegida && !this.trabajando;
  }

  async instalar(): Promise<void> {
    if (!this.puedeSeguir) return;

    const serial = this.elegida.serial || this.elegida.sn;

    if (!await this.dialog.confirm(
      `Se va a autorizar el equipo ${serial} y dejarlo a nombre de ${this.orden.client_name}. ¿Seguimos?`,
      { okLabel: 'Sí, instalar' },
    )) return;

    this.trabajando = true;
    this.error = '';

    this.svc.provisionar(this.orden.id, {
      fsp: this.elegida.fsp,
      ont_id: Number(this.elegida.ont_id ?? 0),
      serial,
      inventory_id: this.inventoryId,
    }).subscribe({
      next: (r: any) => {
        this.trabajando = false;
        this.pasos = r?.data?.pasos ?? [];
        this.avisos = r?.data?.avisos ?? [];
        this.termino = true;
        this.toast.success(r?.message || 'Listo.');
        this.listo.emit();
      },
      error: (e: any) => {
        this.trabajando = false;
        this.pasos = e?.error?.data?.pasos ?? [];
        this.avisos = e?.error?.data?.avisos ?? [];
        this.error = e?.error?.message || 'No se pudo completar la instalación.';
      },
    });
  }
}
