import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule }  from '@angular/forms';
import { RouterLink }   from '@angular/router';
import { InventoryService }           from '../../../services/inventory.service';
import { ToastService }               from '../../../services/toast.service';
import { InventoryCategoryInterface } from '../../../models/inventory-category.interface';

@Component({
  selector: 'app-categories',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './categories.component.html',
  styleUrl: './categories.component.scss',
})
export class CategoriesComponent implements OnInit {
  skeletor   = true;
  showForm   = false;
  isEditing  = false;
  editingId: number | null = null;
  categories: InventoryCategoryInterface[] = [];

  categoryForm = { name: '', description: '' };

  constructor(
    private inventoryService: InventoryService,
    private toast: ToastService,
  ) {}

  ngOnInit() {
    this.loadCategories();
  }

  loadCategories() {
    this.skeletor = true;
    this.inventoryService.getCategories().subscribe(
      data => { this.categories = data.data || []; this.skeletor = false; },
      _err => { this.skeletor = false; },
    );
  }

  toggleForm() {
    this.showForm = !this.showForm;
    this.isEditing = false;
    this.editingId = null;
    this.categoryForm = { name: '', description: '' };
  }

  openEdit(category: InventoryCategoryInterface) {
    this.showForm = true;
    this.isEditing = true;
    this.editingId = category.id || null;
    this.categoryForm = { name: category.name || '', description: category.description || '' };
  }

  cancelForm() {
    this.showForm = false;
    this.isEditing = false;
    this.editingId = null;
    this.categoryForm = { name: '', description: '' };
  }

  saveCategory() {
    if (!this.categoryForm.name.trim()) {
      this.toast.warning('El nombre de la categoría es obligatorio.');
      return;
    }
    if (this.isEditing && this.editingId) {
      this.inventoryService.updateCategory(this.editingId, this.categoryForm).subscribe(data => {
        if (data.error) { this.toast.error(data.message); }
        else { this.toast.success(data.message); this.cancelForm(); this.loadCategories(); }
      });
    } else {
      this.inventoryService.createCategory(this.categoryForm).subscribe(data => {
        if (data.error) { this.toast.error(data.message); }
        else { this.toast.success(data.message); this.cancelForm(); this.loadCategories(); }
      });
    }
  }

  deleteCategory(category: InventoryCategoryInterface) {
    if (!confirm(`¿Eliminar la categoría "${category.name}"? Los ítems asociados quedarán sin categoría.`)) return;
    this.inventoryService.deleteCategory(category.id!).subscribe(data => {
      if (data.error) { this.toast.error(data.message); }
      else { this.toast.success(data.message); this.loadCategories(); }
    });
  }
}
