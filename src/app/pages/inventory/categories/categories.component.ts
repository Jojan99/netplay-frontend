import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule }  from '@angular/forms';
import { RouterLink }   from '@angular/router';
import { InventoryService }           from '../../../services/inventory.service';
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
  categories: InventoryCategoryInterface[] = [];

  newCategory = { name: '', description: '' };

  constructor(private inventoryService: InventoryService) {}

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
    this.newCategory = { name: '', description: '' };
  }

  saveCategory() {
    if (!this.newCategory.name.trim()) {
      alert('El nombre de la categoría es obligatorio.');
      return;
    }
    this.inventoryService.createCategory(this.newCategory).subscribe(data => {
      alert(data.message);
      if (!data.error) { this.showForm = false; this.loadCategories(); }
    });
  }
}
