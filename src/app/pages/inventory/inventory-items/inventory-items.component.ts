import { DialogService } from '../../../services/dialog.service';
import { Component, HostListener, OnInit, inject } from '@angular/core';
import { CommonModule }  from '@angular/common';
import { FormsModule }   from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { InventoryService }           from '../../../services/inventory.service';
import { ToastService }               from '../../../services/toast.service';
import { InventoryItemInterface }     from '../../../models/inventory-item.interface';
import { InventoryCategoryInterface } from '../../../models/inventory-category.interface';
import { BarcodeScannerComponent }    from '../../../components/barcode-scanner/barcode-scanner.component';
import { NpSelectComponent, PresentacionSelect } from '../../../common/np-select/np-select.component';
import { OpcionSimple, PRESENTACION_SIMPLE, PRESENTACION_TEXTOS, conValor } from '../../../common/np-select/presentaciones';

/** Categorías: la descripción debajo y cuántos ítems tiene, cuando el backend lo manda. */
const PRESENTACION_CATEGORIAS: PresentacionSelect<InventoryCategoryInterface> = {
  etiqueta: c => c?.name ?? '',
  detalle: c => c?.description || null,
  insignia: c => (c?.inventories_count != null
    ? { texto: `${c.inventories_count} ${c.inventories_count === 1 ? 'ítem' : 'ítems'}`, tono: 'neutral' }
    : null),
};

/**
 * Ítems del movimiento: SKU (o código) y ubicación debajo; a la derecha el
 * stock, en ámbar si está en el mínimo, como en la tabla.
 */
const PRESENTACION_ITEMS: PresentacionSelect<InventoryItemInterface> = {
  // El id numérico, como lo dejan openMovementModal y el escáner: con [value]
  // el select nativo lo pasaba a texto y un ítem escaneado no se veía elegido.
  valor: i => i?.id,
  etiqueta: i => i?.name ?? '',
  detalle: i => [i?.sku || i?.code, i?.location].filter(Boolean).join(' · ') || null,
  insignia: i => {
    const q = i?.quantity || 0;
    const min = i?.stock_min || 0;
    return { texto: `Stock ${q}${i?.unit ? ' ' + i.unit : ''}`, tono: min > 0 && q <= min ? 'warn' : q > 0 ? 'ok' : 'neutral' };
  },
  buscarEn: i => [i?.name, i?.sku, i?.code, i?.location].filter(Boolean).join(' '),
};

const TIPOS_DE_MOVIMIENTO: OpcionSimple[] = [
  { valor: 'entrada', etiqueta: 'Entrada', prefijo: '+', detalle: 'Suma al stock' },
  { valor: 'salida',  etiqueta: 'Salida',  prefijo: '−', detalle: 'Resta del stock' },
  { valor: 'ajuste',  etiqueta: 'Ajuste',  prefijo: '=', detalle: 'Corrige el conteo' },
];

@Component({
  selector: 'app-inventory-items',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, BarcodeScannerComponent, NpSelectComponent],
  templateUrl: './inventory-items.component.html',
  styleUrl: './inventory-items.component.scss',
  host: { class: 'np-console' },
})
export class InventoryItemsComponent implements OnInit {
  private dialog = inject(DialogService);
  isDesktop = true;
  get lowStockCount(): number { return this.filteredItems.filter(i => this.isLowStock(i)).length; }
  get pageNumbers(): number[] {
    const out: number[] = [];
    for (let i = Math.max(1, this.currentPage - 2); i <= Math.min(this.lastPage, this.currentPage + 2); i++) out.push(i);
    return out;
  }
  skeletor  = true;

  items:         InventoryItemInterface[]     = [];
  filteredItems: InventoryItemInterface[]     = [];
  categories:    InventoryCategoryInterface[] = [];
  locations:     string[]                     = [];

  // Pagination
  currentPage = 1;
  lastPage    = 1;
  totalItems  = 0;
  perPage     = 15;

  // Filters
  searchQuery = '';
  selectedCategoryId: number | '' = '';
  selectedLocation = '';
  showLowStockOnly = false;

  // El filtro guarda el id en texto, como el <option [value]> anterior.
  readonly presCategoriaFiltro = conValor(PRESENTACION_CATEGORIAS, c => String(c.id));
  // El formulario guarda el id como llega del backend: al editar, el ítem trae
  // el número y con texto la categoría no se vería elegida.
  readonly presCategoria = conValor(PRESENTACION_CATEGORIAS, c => c.id);
  readonly presUbicaciones = PRESENTACION_TEXTOS;
  readonly presItems = PRESENTACION_ITEMS;
  readonly presTipoMovimiento = PRESENTACION_SIMPLE;
  readonly tiposDeMovimiento = TIPOS_DE_MOVIMIENTO;

  isEditing = false;
  itemForm: InventoryItemInterface = {};

  selectedItemForMovement: InventoryItemInterface | null = null;
  movementForm = {
    inventory_id:  0,
    type:          'entrada' as 'entrada' | 'salida' | 'ajuste',
    quantity:      1,
    unit_price:    0,
    description:   '',
    reference:     '',
    serial_number: '',
    batch_number:  '',
    expiry_date:   '',
  };

  // Two-phase scan: 'item' → identify equipment, 'serial' → capture SN
  scanStep: 'item' | 'serial' = 'item';
  barcodeError = '';

  // Item creation modal scanner
  itemScannerOpen = false;

  constructor(
    private inventoryService: InventoryService,
    private router: Router,
    private toast: ToastService,
  ) {}

  @HostListener('window:resize', ['$event'])
  onResize(_: any) {
    if (typeof window !== 'undefined') {
      this.isDesktop = window.innerWidth > 768;
    }
  }

  ngOnInit() {
    this.onResize(null);
    this.loadItems();
    this.loadCategories();
    this.loadLocations();
  }

  // ── Data loading ─────────────────────────────────────────────────────────────

  loadItems(page = 1) {
    this.skeletor = true;
    this.currentPage = page;
    this.inventoryService.getItems({
      q: this.searchQuery,
      category_id: this.selectedCategoryId ? +this.selectedCategoryId : undefined,
      location: this.selectedLocation,
      low_stock: this.showLowStockOnly,
      per_page: this.perPage,
      page,
    }).subscribe(
      data  => {
        this.items = data.data?.data || [];
        this.currentPage = data.data?.current_page || 1;
        this.lastPage = data.data?.last_page || 1;
        this.totalItems = data.data?.total || 0;
        this.filteredItems = [...this.items];
        this.skeletor = false;
      },
      _err  => { this.skeletor = false; },
    );
  }

  loadCategories() {
    this.inventoryService.getCategories().subscribe(
      data => { this.categories = data.data || []; },
      _err => {},
    );
  }

  loadLocations() {
    this.inventoryService.getLocations().subscribe(
      data => { this.locations = data.data || []; },
      _err => {},
    );
  }

  applyFilters() {
    this.loadItems(1);
  }

  getCategoryName(id?: number): string {
    if (!id) return '-';
    return this.categories.find(c => c.id === id)?.name || '-';
  }

  isLowStock(item: InventoryItemInterface): boolean {
    const qty = item.quantity || 0;
    const min = item.stock_min || 0;
    return min > 0 && qty <= min;
  }

  // ── Pagination ───────────────────────────────────────────────────────────────

  goToPage(page: number) {
    if (page < 1 || page > this.lastPage) return;
    this.loadItems(page);
  }

  // ── Item modal ───────────────────────────────────────────────────────────────

  openCreateModal() {
    this.isEditing = false;
    this.itemForm  = {};
    this.itemScannerOpen = false;
    document.getElementById('item-modal')?.classList.remove('hidden');
  }

  openEditModal(item: InventoryItemInterface) {
    this.isEditing = true;
    this.itemForm  = { ...item };
    document.getElementById('item-modal')?.classList.remove('hidden');
  }

  closeItemModal() {
    document.getElementById('item-modal')?.classList.add('hidden');
  }

  saveItem() {
    if (this.isEditing && this.itemForm.id) {
      this.inventoryService.updateItem(this.itemForm.id, this.itemForm).subscribe(data => {
        if (data.error) { this.toast.error(data.message); }
        else { this.toast.success(data.message); this.closeItemModal(); this.loadItems(this.currentPage); }
      });
    } else {
      this.inventoryService.createItem(this.itemForm).subscribe(data => {
        if (data.error) { this.toast.error(data.message); }
        else { this.toast.success(data.message); this.closeItemModal(); this.loadItems(1); }
      });
    }
  }

  async deleteItem(item: InventoryItemInterface) {
    if (!await this.dialog.confirm(`¿Eliminar el ítem "${item.name}"? Esta acción no se puede deshacer.`)) return;
    this.inventoryService.deleteItem(item.id!).subscribe(data => {
      if (data.error) { this.toast.error(data.message); }
      else { this.toast.success(data.message); this.loadItems(this.currentPage); }
    });
  }

  viewDetail(item: InventoryItemInterface) {
    this.router.navigate(['/dashboard/inventory/items', item.id]);
  }

  // ── Movement modal ───────────────────────────────────────────────────────────

  openMovementModal(item: InventoryItemInterface) {
    this.selectedItemForMovement = item;
    this.resetMovementForm(item.id!);
    this.scanStep = 'serial'; // item already known, go straight to SN
    document.getElementById('movement-modal')?.classList.remove('hidden');
  }

  openMovementModalFromList() {
    this.selectedItemForMovement = null;
    this.resetMovementForm(0);
    this.scanStep = 'item';
    document.getElementById('movement-modal')?.classList.remove('hidden');
  }

  private resetMovementForm(inventoryId: number): void {
    this.barcodeError = '';
    this.movementForm = {
      inventory_id:  inventoryId,
      type:          'salida',
      quantity:      1,
      unit_price:    0,
      description:   '',
      reference:     '',
      serial_number: '',
      batch_number:  '',
      expiry_date:   '',
    };
  }

  onMovementItemChange() {
    const id = +this.movementForm.inventory_id;
    this.selectedItemForMovement = this.items.find(i => i.id === id) || null;
  }

  closeMovementModal() {
    document.getElementById('movement-modal')?.classList.add('hidden');
  }

  saveMovement() {
    if (this.movementForm.inventory_id === 0) {
      this.toast.warning('Selecciona un ítem.');
      return;
    }
    if (this.movementForm.quantity <= 0) {
      this.toast.warning('La cantidad debe ser mayor a 0.');
      return;
    }
    if (this.movementForm.type === 'salida' && this.selectedItemForMovement) {
      if (this.movementForm.quantity > (this.selectedItemForMovement.quantity || 0)) {
        this.toast.error(`Stock insuficiente. Stock actual: ${this.selectedItemForMovement.quantity || 0}`);
        return;
      }
    }
    this.inventoryService.createMovement(this.movementForm).subscribe(data => {
      if (data.error) { this.toast.error(data.message); }
      else { this.toast.success(data.message); this.closeMovementModal(); this.loadItems(this.currentPage); }
    });
  }

  closeMovementModalFull(): void {
    this.barcodeError = '';
    this.scanStep = 'item';
    this.closeMovementModal();
  }

  // Phase 1: scan item reference/SKU to identify the equipment type
  onRefScanned(code: string): void {
    this.barcodeError = '';
    const item =
      this.items.find(i => i.sku === code || i.code === code) ||
      this.items.find(i => String(i.id) === code) ||
      this.items.find(i => i.name?.toLowerCase().includes(code.toLowerCase()));

    if (item) {
      this.movementForm.inventory_id = item.id!;
      this.selectedItemForMovement   = item;
      this.scanStep = 'serial';         // advance automatically
    } else {
      this.barcodeError = `No se encontró equipo con referencia "${code}". Verifica el SKU o selecciónalo manualmente.`;
    }
  }

  // Phase 2: scan equipment serial number
  onSerialScanned(code: string): void {
    this.barcodeError = '';
    this.movementForm.serial_number = code;
  }

  // Item creation modal: scan SKU/code of the equipment
  onItemSkuScanned(code: string): void {
    this.itemForm.sku = code;
    this.itemScannerOpen = false;
  }
}
