import { Component, HostListener, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { UserService } from '../../../services/user.service';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { GenericInterface } from '../../../models/generic-interface';
import { Router } from '@angular/router';
import { OltService } from '../../../services/olt.service';
import { OltOntDetailInterface } from '../../../models/olt-ont-detailt';
@Component({
  selector: 'app-ont-details',
  standalone: true,
  imports: [CommonModule,FormsModule],
  templateUrl: './ont-details.component.html',
  styleUrls: ['./ont-details.component.scss']
})
export class OntDetailsComponent implements OnInit {
  ticketForm: FormGroup;
  isDesktop: boolean = false;
  isLoading: boolean = false;
  oltOntDetailInterface: OltOntDetailInterface[] = [];
  originalOltOntDetailInterface: OltOntDetailInterface[] = [];
  oltOntDetails: any[] = [];
  filterValues = {
    description: '',
    slot: '',
    position_ont: '',
    sn: '',
    equipmentID: '',
    onlineOnts: '',
    
  };
  currentPage = 1;
  onus = 0;
  onusRegiter = 0;
  onusOnline = 0;
  onusOver = 0;
  totalEntries = 1000;
  entriesPerPage = 10;
  startIndex: number = 0;
  endIndex: number = 0;
  constructor(private fb: FormBuilder, private oltService: OltService, private router: Router) {
    // Definir el formulario usando FormBuilder
    this.ticketForm = this.fb.group({
      client: [''],
      address: [''],
      names: [''],
      date: [new Date().toISOString().substring(0, 10)],
      type_service: [0],
      priority: [0],
      tecnichal: [0],
      observation: ['', Validators.required],
      cedula: [''],
      phone: [''],
      search: ['']
    });
  }

  // Propiedad para datos filtrados

  ngOnInit() {
    this.onResize(null);
    this.getOntDetail();
    this.calculateIndexes();
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    if (typeof window !== 'undefined') {
      this.isDesktop = window.innerWidth > 768; // 768px es un ejemplo, ajusta según tus necesidades
    }
  }


  get isLastPage(): boolean {
    return this.endIndex === this.oltOntDetailInterface.length;
  }

  applyFilter() {
    const currentStartIndex = this.startIndex; // Guarda el índice de inicio actual
  
    if (this.filterValues.description === '' && this.filterValues.slot === '' && this.filterValues.sn === '' && this.filterValues.equipmentID === '') {
      // Si todos los filtros están vacíos, se restauran los datos originales
      this.oltOntDetailInterface = [...this.originalOltOntDetailInterface];
    } else {
      // Si hay algún filtro activo, se realiza el filtrado
      this.oltOntDetailInterface = this.originalOltOntDetailInterface.filter(olt => {
        return (
          (this.filterValues.description === '' || olt.description.toLowerCase().includes(this.filterValues.description.toLowerCase())) &&
          (this.filterValues.slot === '' || olt.slot.toString().includes(this.filterValues.slot.toString())) &&
          (this.filterValues.sn === '' || olt.sn.toLowerCase().includes(this.filterValues.sn.toLowerCase())) &&
          (this.filterValues.position_ont === '' || olt.position_ont.toLowerCase().includes(this.filterValues.position_ont.toLowerCase())) &&
          (this.filterValues.onlineOnts === '' || olt.onlineOnts.toLowerCase().includes(this.filterValues.onlineOnts.toLowerCase())) &&
          (this.filterValues.equipmentID === '' || olt.equipmentID.toLowerCase().includes(this.filterValues.equipmentID.toLowerCase()))
        );
      });
    }
  
    // Calcular el nuevo número total de páginas basado en los datos filtrados
    const totalFilteredEntries = this.oltOntDetailInterface.length;
    const totalPages = Math.ceil(totalFilteredEntries / this.entriesPerPage);
  
    // Mantener la página actual, pero si el filtrado resulta en menos páginas, ajustar la página
    if (this.currentPage > totalPages) {
      this.currentPage = totalPages; // Si la página actual es mayor que las páginas disponibles, ajustarla
    }
  
    this.calculateIndexes(); // Recalcula los índices de paginación
    
  }
  
  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.calculateIndexes(); // Recalcular los índices después de cambiar la página
    }
  }
  
  nextPage() {
    if (this.currentPage < Math.ceil(this.totalEntries / this.entriesPerPage)) {
      this.currentPage++;
      this.calculateIndexes(); // Recalcular los índices después de cambiar la página
    }
  }

  calculateIndexes() {
    this.startIndex = (this.currentPage - 1) * this.entriesPerPage;
    this.endIndex = Math.min(this.currentPage * this.entriesPerPage, this.totalEntries);
  
    // Aplicamos los índices a los datos filtrados
    this.oltOntDetails = this.oltOntDetailInterface.slice(this.startIndex, this.endIndex);
  }

  toggleDetails(oltOntDetailInterface: OltOntDetailInterface): void {
    console.log('Before toggle:', oltOntDetailInterface.expanded);
    oltOntDetailInterface.expanded = !oltOntDetailInterface.expanded;
    console.log('After toggle:', oltOntDetailInterface.expanded);
  }

  getOntDetail() {
    this.isLoading = true;

    this.oltService.getOntdetail().subscribe(
      (data) => {
        this.oltOntDetailInterface = data.data.data.map((e: any) => ({
          FS_P: e.F_S_P,
          description: e.name.replace(/_/g, ' '),
          sn: e.SN,
          vendorID: e.vendorID,
          equipmentID: e.EquipoNombre,
          onlineOnts: e.Status,
          slot: e.port.slot,
          position_ont: e.port.position_ont,
          expanded: false,  // Se agrega esta propiedad para manejar el estado de expansión
        }));

        this.originalOltOntDetailInterface = [...this.oltOntDetailInterface];

        this.onus = data.data.total_equipos;
        this.onusOver = data.data.total_equiposOffline;

        this.onusOnline = this.onus - this.onusOver;
        this.isLoading = false;
      },
      (error) => {
        console.error('Error al obtener usuarios:', error);
      }
    );
  }

  getOntStatusAll() {
    this.oltService.getOntStatusAll().subscribe(
      (data) => {
        this.onusOnline = data.summary['onlineOnts'];
        this.onusRegiter = data.summary['totalOnts'];
        this.onusOver = this.onusRegiter - this.onusOnline;
        this.oltOntDetailInterface = data.ontDetails.map((e: any) => ({
          FS_P: e.FS_P,
          expanded: false  // Asegúrate de inicializar 'expanded' para cada elemento
        }));
      },
      (error) => {
        console.error('Error al obtener usuarios:', error);
      }
    );
  }

  registerOnt(sn: any) {
    console.log(sn);
  }
}
