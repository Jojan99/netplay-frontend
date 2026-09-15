import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DarkThemeToggleComponent } from '../../common/dark-theme-toggle.component';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subject, Subscription, debounceTime, switchMap } from 'rxjs';
import { CompanyService } from '../../services/company.service';
import { SitioService } from '../../services/sitio.service';

type Step = 1 | 2 | 3;
type EstadoSubdominio = 'vacio' | 'revisando' | 'libre' | 'ocupado';

@Component({
  selector: 'app-register-company',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, DarkThemeToggleComponent],
  templateUrl: './register-company.component.html',
  styleUrls: ['../sign-in/sign-in/sign-in.component.scss', './register-company.component.scss'],
  styles: [`
    .np-subdominio { display: flex; align-items: stretch; }
    .np-subdominio .np-input { flex: 1; min-width: 0; text-align: right; border-top-right-radius: 0; border-bottom-right-radius: 0; }
    .np-subdominio-dom { display: flex; align-items: center; padding: 0 10px; border: 1px solid var(--line); border-left: 0; border-radius: 0 var(--radius) var(--radius) 0; background: var(--surface-2); color: var(--text-3); font: 500 13px var(--font-mono); white-space: nowrap; }
    .np-fine.is-libre { color: var(--ok); }
    .np-fine.is-ocupado { color: var(--danger); }
  `],
})
export class RegisterCompanyComponent implements OnInit, OnDestroy {
  /** El dominio desde el que se abre (netvula.com). */
  readonly sitio = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'netvula.com';
  /** El dominio base de los subdominios; lo confirma el backend. */
  dominio = this.sitio.replace(/^www\./, '');
  isLoading = false;
  errorMsg  = '';
  successMsg = '';
  step: Step = 1;
  showPw = false;

  readonly steps = [
    { n: 1 as Step, label: 'Empresa',      hint: 'Datos legales y de contacto' },
    { n: 2 as Step, label: 'Facturación',  hint: 'Cómo se ve tu factura' },
    { n: 3 as Step, label: 'Administrador', hint: 'Con qué cuenta vas a entrar' },
  ];

  form = {
    name:           '',
    subdomain:      '',
    nit:            '',
    email:          '',
    phone:          '',
    address:        '',
    city:           '',
    country:        'Colombia',
    invoice_prefix: '',
    admin_name:     '',
    admin_lastname: '',
    admin_dni:      '',
    admin_phone:    '',
    admin_username: '',
    admin_password: '',
  };
  passwordConfirm = '';

  /* ── Dirección de la empresa (empresa.netvula.com) ───────────── */
  /** Mientras no la toque, la dirección sigue al nombre de la empresa. */
  private subdominioTocado = false;
  subdominioEstado: EstadoSubdominio = 'vacio';
  subdominioMensaje = 'Si la dejás vacía, la armamos con el nombre de la empresa.';
  private revisarSubdominio = new Subject<string>();
  private subs = new Subscription();

  private sitioService = inject(SitioService);
  private route        = inject(ActivatedRoute);

  /* ── Validación por paso ─────────────────────────────────────── */
  private req(v: string): boolean { return !!v && v.trim().length > 1; }
  get emailOk(): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form.email.trim()); }
  get phoneOk(): boolean { return this.form.phone.replace(/\D/g, '').length >= 7; }
  get usernameOk(): boolean { return !this.form.admin_username || /^[A-Za-z0-9._-]+$/.test(this.form.admin_username); }
  get subdominioOk(): boolean { return this.form.subdomain === '' || this.subdominioEstado === 'libre'; }
  get passwordStrength(): { score: number; label: string; cls: string } {
    const p = this.form.admin_password;
    let score = 0;
    if (p.length >= 6) score++;
    if (p.length >= 10) score++;
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
    if (/\d/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;
    const label = score <= 1 ? 'Débil' : score <= 3 ? 'Aceptable' : 'Fuerte';
    return { score, label, cls: score <= 1 ? 'is-weak' : score <= 3 ? 'is-mid' : 'is-strong' };
  }
  get passwordsMatch(): boolean { return !this.passwordConfirm || this.form.admin_password === this.passwordConfirm; }

  step1Ok(): boolean {
    return this.req(this.form.name) && this.req(this.form.nit) && this.emailOk && this.phoneOk && this.req(this.form.address)
      && this.subdominioOk;
  }
  step2Ok(): boolean { return true; }   // todo opcional, se puede completar luego
  step3Ok(): boolean {
    return this.req(this.form.admin_name) && this.req(this.form.admin_lastname)
      && this.form.admin_password.length >= 6 && this.form.admin_password === this.passwordConfirm
      && this.usernameOk;
  }
  stepOk(n: Step): boolean { return n === 1 ? this.step1Ok() : n === 2 ? this.step2Ok() : this.step3Ok(); }

  /** El usuario por defecto es el NIT, igual que lo crea el backend. */
  get usernamePreview(): string { return this.form.admin_username.trim() || this.form.nit.trim() || 'tu-nit'; }
  get prefixPreview(): string { return (this.form.invoice_prefix.trim() || 'FAC').toUpperCase(); }

  constructor(
    private companyService: CompanyService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.subs.add(this.sitioService.cargar().subscribe(s => {
      if (s?.plataforma?.dominio) this.dominio = s.plataforma.dominio;
    }));

    this.subs.add(this.revisarSubdominio.pipe(
      debounceTime(350),
      switchMap(s => this.sitioService.disponible(s)),
    ).subscribe(r => {
      // Sólo cuenta la respuesta de lo que sigue escrito.
      if (r.subdominio !== this.form.subdomain) return;
      this.subdominioEstado  = r.disponible ? 'libre' : 'ocupado';
      this.subdominioMensaje = r.disponible ? `Tu equipo y tus clientes van a entrar por ${r.direccion}` : r.mensaje;
    }));

    // Viene de reservarla en la página pública.
    const pedido = this.limpiarSubdominio(this.route.snapshot.queryParamMap.get('subdominio') ?? '');
    if (pedido) {
      this.subdominioTocado = true;
      this.ponerSubdominio(pedido);
    }
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  alCambiarNombre(nombre: string): void {
    this.form.name = nombre;
    if (!this.subdominioTocado) this.ponerSubdominio(this.sugerirSubdominio(nombre));
  }

  alEscribirSubdominio(campo: HTMLInputElement): void {
    const limpio = this.limpiarSubdominio(campo.value);
    if (campo.value !== limpio) {
      // Sin esto el cursor saltaba al final al corregir una letra en el medio.
      const cursor = Math.min(campo.selectionStart ?? limpio.length, limpio.length);
      campo.value = limpio;
      campo.setSelectionRange(cursor, cursor);
    }
    // Si la borra, vuelve a seguir al nombre.
    this.subdominioTocado = limpio !== '';
    this.ponerSubdominio(limpio || this.sugerirSubdominio(this.form.name));
  }

  private ponerSubdominio(sub: string): void {
    this.form.subdomain = sub;

    if (sub.length < 3) {
      this.subdominioEstado  = 'vacio';
      this.subdominioMensaje = sub ? 'Usá al menos 3 caracteres.' : 'Si la dejás vacía, la armamos con el nombre de la empresa.';
      return;
    }

    this.subdominioEstado  = 'revisando';
    this.subdominioMensaje = 'Revisando si está libre…';
    this.revisarSubdominio.next(sub);
  }

  private limpiarSubdominio(valor: string): string {
    return valor.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-{2,}/g, '-')
      .slice(0, 40);
  }

  /** "Netplay S.A.S." → "netplay", igual que lo arma el backend. */
  private sugerirSubdominio(nombre: string): string {
    const slug = this.limpiarSubdominio(nombre.replace(/[.]/g, ' ').replace(/[^A-Za-zÀ-ÿ0-9\s-]/g, ' ').trim())
      .replace(/-(s-a-s|sas|s-a|sa|ltda|limitada|e-u|eu)$/, '')
      .replace(/^-+|-+$/g, '');
    return slug.length >= 3 ? slug : '';
  }

  next(): void {
    this.errorMsg = '';
    if (!this.stepOk(this.step)) { this.errorMsg = 'Completá los campos marcados para continuar.'; return; }
    if (this.step < 3) this.step = (this.step + 1) as Step;
  }
  back(): void { this.errorMsg = ''; if (this.step > 1) this.step = (this.step - 1) as Step; }
  goTo(n: Step): void { if (n < this.step || this.stepOk(this.step)) { this.errorMsg = ''; this.step = n; } }

  register(): void {
    if (this.step < 3) { this.next(); return; }
    if (!this.step1Ok() || !this.step3Ok()) { this.errorMsg = 'Revisá los datos: hay campos incompletos.'; return; }

    this.isLoading  = true;
    this.errorMsg   = '';
    this.successMsg = '';

    // Sólo se mandan los campos con valor: los vacíos los completa el backend
    const payload: Record<string, string> = {};
    Object.entries(this.form).forEach(([k, v]) => { if (String(v ?? '').trim()) payload[k] = String(v).trim(); });

    this.companyService.register(payload).subscribe({
      next: (res) => {
        this.isLoading = false;
        if (!res.error) {
          // La pantalla siguiente muestra a qué dirección salió el correo y
          // permite reenviarlo. Va por sessionStorage y no por la URL para no
          // dejar el correo en el historial del navegador.
          try { sessionStorage.setItem('alta_email', payload['email'] ?? ''); } catch {}
          this.router.navigate(['/confirm-email']);
        } else {
          this.errorMsg = res.message || 'No pudimos registrar la empresa.';
          if (/NIT|correo|usuario|dirección/i.test(this.errorMsg)) this.step = /usuario/i.test(this.errorMsg) ? 3 : 1;
        }
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMsg  = err?.error?.message || 'No pudimos registrar la empresa. Intentá de nuevo.';
        if (/dirección|NIT|correo/i.test(this.errorMsg)) this.step = 1;
      },
    });
  }
}
