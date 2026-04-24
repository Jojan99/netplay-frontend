import { Component, OnInit } from '@angular/core';
import { Chart } from 'chart.js/auto';

@Component({
  selector: 'app-charts',
  templateUrl: './charts.component.html',
  standalone: true,
  styleUrls: ['./charts.component.scss']
})
export class ChartsComponent implements OnInit {
  constructor() { }

  ngOnInit(): void {
    this.renderClientsChart();
    this.renderContractsChart();
    this.renderIncomeChart();
  }

  active = 0;
  inactive = 0;

  renderClientsChart() {
    new Chart("clientsChart", {
      type: 'line',
      data: {
        labels: ['Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto'],
        datasets: [{
          label: 'Eliminados',
          data: [12, 19, 3, 5, 2, 3],
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          fill: true,
        }, {
          label: 'Registrados',
          data: [22, 29, 25, 35, 42, 23],
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          fill: true,
        }]
      },
      options: {
        responsive: true,
      }
    });
  }

  renderContractsChart() {
    new Chart("contractsChart", {
      type: 'doughnut',
      data: {
        labels: ['Habilitados', 'Deshabilitados'],
        datasets: [{
          data: [90, 10],
          backgroundColor: ['#10b981', '#ef4444'],
        }]
      },
      options: {
        responsive: true,
      }
    });
  }

  renderIncomeChart() {
    new Chart("incomeChart", {
      type: 'line',
      data: {
        labels: ['Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto'],
        datasets: [{
          label: 'Ingresos',
          data: [1200000, 1500000, 1800000, 2000000, 2100000, 2200000],
          borderColor: 'rgb(54, 162, 235)',
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          fill: true,
        }]
      },
      options: {
        responsive: true,
      }
    });
  }
}
