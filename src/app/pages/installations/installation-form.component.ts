import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { InstallationService } from '../../services/installation.service';
import { OltService } from '../../services/olt.service';

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

  form = this.emptyForm();

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

  plans: any[] = [];
  olts: any[] = [];

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

  loadOptions(): void {
    this.svc.getTechnicians().subscribe(r => this.technicians = r?.data || r || []);
    this.svc.getPlans().subscribe((r: any) => this.plans = r?.data || r || []);
    this.oltSvc.listOlts().subscribe({
      next: (r: any) => this.olts = r?.data ?? [],
      error: () => { /* sin OLT se puede tomar el pedido igual */ },
    });
  }

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

  save(): void {
    if (!this.form.client_name || !this.form.client_dni || !this.form.client_phone || !this.form.address || !this.form.scheduled_date) {
      this.errorMsg = 'Por favor complete los campos requeridos';
      return;
    }

    this.isSaving = true;
    this.errorMsg = '';

    const data: any = {
      client_name: this.form.client_name,
      client_dni: this.form.client_dni,
      client_phone: this.form.client_phone,
      client_email: this.form.client_email || undefined,
      address: this.form.address,
      neighborhood: this.form.neighborhood || undefined,
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
      error: () => {
        this.isSaving = false;
        this.errorMsg = 'Error al crear';
      },
    });
  }

  toast(msg: string): void {
    this.successMsg = msg;
    setTimeout(() => { this.successMsg = ''; }, 3500);
  }

  get isValid(): boolean {
    return !!(this.form.client_name && this.form.client_dni && this.form.client_phone && this.form.address && this.form.scheduled_date);
  }
}