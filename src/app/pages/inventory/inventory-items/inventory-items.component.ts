import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule }  from '@angular/common';
import { FormsModule }   from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { InventoryService }           from '../../../services/inventory.service';
import { ToastService }               from '../../../services/toast.service';
import { InventoryItemInterface }     from '../../../models/inventory-item.interface';
import { InventoryCategoryInterface } from '../../../models/inventory-category.interface';
import { BarcodeScannerComponent }    from '../../../components/barcode-scanner/barcode-scanner.component';

@Component({
  selector: 'app-inventory-items',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, BarcodeScannerComponent],
  templateUrl: './inventory-items.component.html',
  styleUrl: './inventory-items.component.scss',
})
export class InventoryItemsComponent implements OnInit {
  isDesktop = true;
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

  deleteItem(item: InventoryItemInterface) {
    if (!confirm(`¿Eliminar el ítem "${item.name}"? Esta acción no se puede deshacer.`)) return;
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
