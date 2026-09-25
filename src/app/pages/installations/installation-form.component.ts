import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { InstallationService } from '../../services/installation.service';
import { OltService } from '../../services/olt.service';

/**
 * Tomar el pedido de una instalación.
 *
 * Son veinte campos, y desparramados en tarjetas no se sabía por dónde
 * empezar ni qué faltaba. Van en cuatro pasos —quién, qué servicio, cómo queda
 * la casa, quién la hace— uno a la vez, y no se puede avanzar sin lo
 * obligatorio de ese paso: así el que carga se entera acá y no el técnico
 * cuando ya está en la casa del cliente.
 *
 * Todo lo que se llene viaja con la orden hasta la calle. El cliente no se da
 * de alta todavía: eso pasa cuando el técnico termina.
 */
@Component({
  selector: 'app-installation-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './installation-form.component.html',
  styleUrl: './installation-form.component.scss',
  host: { class: 'np-console' },
})
export class InstallationFormComponent implements OnInit {
  isLoading = false;
  isSaving = false;
  errorMsg = '';
  successMsg = '';

  technicians: any[] = [];
  paymentMethods: any[] = [];
  plans: any[] = [];
  olts: any[] = [];

  form = this.emptyForm();

  /**
   * Los cuatro pasos. Campo fijo, no getter: en un *ngFor un getter que
   * devuelve un array nuevo rompe los clics.
   */
  readonly PASOS = [
    { n: 1, titulo: 'Cliente',              corto: 'Cliente',   ayuda: 'Los datos de quien pidió el servicio. Se da de alta como cliente cuando el técnico termine la instalación, no ahora.' },
    { n: 2, titulo: 'Servicio y conexión',  corto: 'Servicio',  ayuda: 'Qué se le vende y cómo entra a la red. El técnico no tiene que llamar a la oficina a preguntarlo.' },
    { n: 3, titulo: 'WiFi y visita',        corto: 'WiFi',      ayuda: 'Cómo queda la casa y cuándo se va. El WiFi se deja puesto solo si la empresa tiene el aprovisionamiento encendido.' },
    { n: 4, titulo: 'Técnicos y costos',    corto: 'Técnicos',  ayuda: 'Quién la hace y cuánto se cobra y se paga.' },
  ];

  paso = 1;

  constructor(
    private svc: InstallationService,
    private oltSvc: OltService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadOptions();
  }

  emptyForm() {
    return {
      user_data_id: '',
      client_name: '',
      client_dni: '',
      client_phone: '',
      client_email: '',
      address: '',
      neighborhood: '',
      // El servicio que se le va a instalar. Se acuerda acá, al tomar el
      // pedido, para que el técnico no tenga que llamar desde la casa.
      internet_plan_id: '',
      grupo_facturacion: '1',
      connection_type: 'pppoe',
      pppoe_user: '',
      pppoe_password: '',
      pppoe_profile: '',
      ip_asignada: '',
      router_id: '',
      wifi_ssid: '',
      wifi_password: '',
      olt_id: '',
      vlan: '',

      scheduled_date: '',
      scheduled_time: '09:00',
      installation_cost: '0',
      technician_ids: [] as number[],
      commission_amount: '0',
      observations: '',
    };
  }

  loadOptions(): void {
    this.svc.getTechnicians().subscribe(r => this.technicians = r?.data || r || []);
    this.svc.getPlans().subscribe((r: any) => this.plans = r?.data || r || []);
    this.oltSvc.listOlts().subscribe({
      next: (r: any) => this.olts = r?.data ?? [],
      error: () => { /* sin OLT se puede tomar el pedido igual */ },
    });
  }

  // ── Los pasos ─────────────────────────────────────────────────────────────

  get pasoActual() {
    return this.PASOS[this.paso - 1];
  }

  get esElUltimo(): boolean {
    return this.paso === this.PASOS.length;
  }

  /**
   * Qué le falta a un paso, en palabras.
   *
   * Sirve para dos cosas a la vez: pintar el paso como incompleto en la barra
   * de arriba y decirle al que carga qué es lo que falta, en vez del
   * «complete los campos requeridos» de antes.
   */
  faltaEnElPaso(n: number): string {
    const f = this.form;
    const falta: string[] = [];

    if (n === 1) {
      if (!f.client_name?.trim()) falta.push('el nombre');
      if (!f.client_dni?.trim()) falta.push('el documento');
      if (!f.client_phone?.trim()) falta.push('el teléfono');
      if (!f.address?.trim()) falta.push('la dirección');
    }

    if (n === 2) {
      if (!f.internet_plan_id) falta.push('el plan');
      if (this.esPppoe) {
        if (!f.pppoe_user?.trim()) falta.push('el usuario PPPoE');
      } else if (!f.ip_asignada?.trim()) {
        falta.push('la IP');
      }
      // Sin OLT cargada no se puede pedir; con OLT sí, porque el técnico no
      // puede autorizar el equipo sin saber por dónde entra.
      if (this.olts.length && !f.olt_id) falta.push('la OLT');
    }

    if (n === 3) {
      if (!f.scheduled_date) falta.push('la fecha');
      if (!f.scheduled_time) falta.push('la hora');
      if (this.problemaDelNombreWifi) falta.push('arreglar el nombre del WiFi');
      if (this.problemaDeLaClaveWifi) falta.push('arreglar la clave del WiFi');
    }

    return falta.length ? 'Falta ' + falta.join(', ') + '.' : '';
  }

  pasoCompleto(n: number): boolean {
    return !this.faltaEnElPaso(n);
  }

  /** Se puede ir a un paso si los anteriores están listos. */
  irA(n: number): void {
    if (n === this.paso) return;

    for (let i = 1; i < n; i++) {
      if (!this.pasoCompleto(i)) {
        this.paso = i;
        this.errorMsg = this.faltaEnElPaso(i);
        return;
      }
    }

    this.errorMsg = '';
    this.paso = n;
  }

  siguiente(): void {
    const falta = this.faltaEnElPaso(this.paso);

    if (falta) {
      this.errorMsg = falta;
      return;
    }

    this.errorMsg = '';
    if (!this.esElUltimo) this.paso++;
  }

  atras(): void {
    this.errorMsg = '';
    if (this.paso > 1) this.paso--;
  }

  // ── Reglas de los campos ──────────────────────────────────────────────────

  /** Con PPPoE no hay IP fija que pedir, y al revés. */
  get esPppoe(): boolean { return this.form.connection_type === 'pppoe'; }

  /**
   * La clave del WiFi tiene que entrar en el equipo.
   *
   * La OLT y las ONT rechazan la ñ, los acentos y varios signos, y toda la
   * orden se manda junta: una clave con ñ hace fallar también el nombre de la
   * red. Mejor que se sepa acá y no con el técnico en la casa del cliente.
   */
  get problemaDeLaClaveWifi(): string {
    const c = this.form.wifi_password ?? '';
    if (!c) return '';
    if (c.length < 8) return 'Al menos 8 caracteres.';
    if (!/^[A-Za-z0-9\-_.@#$%&*+=!?():,]+$/.test(c)) return 'Sin ñ, sin tildes y sin espacios: el equipo la rechaza.';
    return '';
  }

  get problemaDelNombreWifi(): string {
    const n = this.form.wifi_ssid ?? '';
    if (!n) return '';
    if (!/^[A-Za-z0-9\-_. ]+$/.test(n)) return 'Sin ñ ni tildes: el equipo lo rechaza.';
    return '';
  }

  // ── Técnicos y comisión ───────────────────────────────────────────────────

  toggleTechnician(id: number): void {
    if (!this.form.technician_ids) {
      this.form.technician_ids = [];
    }
    const idx = this.form.technician_ids.indexOf(id);
    if (idx > -1) {
      this.form.technician_ids.splice(idx, 1);
    } else {
      this.form.technician_ids.push(id);
    }
    // Auto-calcular comisión por técnico si hay un valor total
    this.updateCommissionPerTechnician();
  }

  updateCommissionPerTechnician(): void {
    // Si no hay técnico seleccionado, no hacer nada
    if (!this.form.technician_ids?.length) return;

    // Si hay un valor de comisión total, dividirlo
    const totalCommission = parseFloat(this.form.commission_amount) || 0;
    if (totalCommission > 0) {
      // Solo para mostrar, el cálculo real se hace en el backend
      this.commissionPerTechnician = totalCommission / this.form.technician_ids.length;
    }
  }

  commissionPerTechnician: number = 0;

  get totalCommission(): number {
    return parseFloat(this.form.commission_amount) || 0;
  }

  onCommissionChange(event: any): void {
    this.form.commission_amount = event.target.value;
    this.updateCommissionPerTechnician();
  }

  /** El nombre del plan elegido, para el resumen del último paso. */
  get nombreDelPlan(): string {
    const p = this.plans.find(x => String(x.id) === String(this.form.internet_plan_id));
    return p ? p.plan_name : '—';
  }

  get nombreDeLaOlt(): string {
    const o = this.olts.find(x => String(x.id) === String(this.form.olt_id));
    return o ? o.name : '—';
  }

  // ── Guardar ───────────────────────────────────────────────────────────────

  save(): void {
    // El primero que esté incompleto: se salta a ese paso en vez de avisar
    // «faltan campos» sin decir dónde.
    for (const p of this.PASOS) {
      const falta = this.faltaEnElPaso(p.n);

      if (falta) {
        this.paso = p.n;
        this.errorMsg = falta;
        return;
      }
    }

    this.isSaving = true;
    this.errorMsg = '';

    const num = (v: string) => (v === '' || v === null || v === undefined ? undefined : Number(v));

    const data: any = {
      client_name: this.form.client_name,
      client_dni: this.form.client_dni,
      client_phone: this.form.client_phone,
      client_email: this.form.client_email || undefined,
      address: this.form.address,
      neighborhood: this.form.neighborhood || undefined,

      // El servicio y la conexión: sin esto el técnico no puede aprovisionar
      // desde la calle, que es de lo que se trata todo este flujo.
      internet_plan_id: num(this.form.internet_plan_id),
      grupo_facturacion: num(this.form.grupo_facturacion),
      connection_type: this.form.connection_type,
      pppoe_user: this.esPppoe ? (this.form.pppoe_user || undefined) : undefined,
      pppoe_password: this.esPppoe ? (this.form.pppoe_password || undefined) : undefined,
      pppoe_profile: this.esPppoe ? (this.form.pppoe_profile || undefined) : undefined,
      ip_asignada: this.esPppoe ? undefined : (this.form.ip_asignada || undefined),
      router_id: num(this.form.router_id),
      olt_id: num(this.form.olt_id),
      vlan: num(this.form.vlan),
      wifi_ssid: this.form.wifi_ssid || undefined,
      wifi_password: this.form.wifi_password || undefined,

      scheduled_date: this.form.scheduled_date,
      scheduled_time: this.form.scheduled_time,
      installation_cost: this.form.installation_cost ? parseFloat(this.form.installation_cost) : 0,
      technician_ids: this.form.technician_ids?.length ? this.form.technician_ids : undefined,
      commission_amount: this.form.commission_amount ? parseFloat(this.form.commission_amount) : 0,
      observations: this.form.observations || undefined,
      user_data_id: this.form.user_data_id ? parseInt(this.form.user_data_id) : undefined,
    };

    this.svc.create(data).subscribe({
      next: r => {
        this.isSaving = false;
        if (r.status === 0 || r.status === undefined) {
          this.toast(r.message || 'Instalación creada');
          this.router.navigate(['/dashboard/installations']);
        } else {
          this.errorMsg = r.message || 'Error al crear';
        }
      },
      error: e => {
        this.isSaving = false;
        this.errorMsg = e?.error?.message || 'Error al crear';
      },
    });
  }

  toast(msg: string): void {
    this.successMsg = msg;
    setTimeout(() => { this.successMsg = ''; }, 3500);
  }

  get isValid(): boolean {
    return this.PASOS.every(p => this.pasoCompleto(p.n));
  }
}
