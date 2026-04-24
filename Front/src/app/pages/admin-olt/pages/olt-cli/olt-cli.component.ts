import { Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OltService } from '../../../../services/olt.service';
import { ToastService } from '../../../../services/toast.service';

interface CliEntry {
  type: 'cmd' | 'out' | 'err';
  text: string;
  ts: string;
}

@Component({
  selector: 'app-olt-cli',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './olt-cli.component.html',
})
export class OltCliComponent implements OnInit {

  @ViewChild('termOutput') termOutput!: ElementRef<HTMLElement>;

  olts: any[]           = [];
  selectedOltId: number | null = null;
  loadingOlts           = false;

  command               = '';
  history: CliEntry[]   = [];
  cmdHistory: string[]  = [];
  historyIdx            = -1;
  running               = false;

  constructor(
    private oltService: OltService,
    private toast: ToastService,
  ) {}

  ngOnInit(): void { this.loadOlts(); }

  loadOlts(): void {
    this.loadingOlts = true;
    this.oltService.listOlts().subscribe({
      next: (res) => {
        this.loadingOlts = false;
        this.olts = res.data ?? [];
        if (this.olts.length === 1) {
          this.selectedOltId = this.olts[0].id;
        }
      },
      error: () => { this.loadingOlts = false; },
    });
  }

  onOltChange(): void { this.history = []; this.command = ''; }

  runCommand(): void {
    const cmd = this.command.trim();
    if (!cmd || !this.selectedOltId || this.running) return;

    this.cmdHistory.unshift(cmd);
    this.historyIdx = -1;
    this.history.push({ type: 'cmd', text: cmd, ts: this.now() });
    this.command = '';
    this.running = true;

    this.oltService.cliCommand(this.selectedOltId, cmd).subscribe({
      next: (res) => {
        this.running = false;
        const output = res.data?.output ?? res.message ?? '';
        this.history.push({ type: 'out', text: this.formatOutput(output), ts: this.now() });
        this.scrollBottom();
      },
      error: (err) => {
        this.running = false;
        const msg = err?.error?.message || 'Error al ejecutar comando';
        this.history.push({ type: 'err', text: msg, ts: this.now() });
        this.scrollBottom();
      },
    });
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (this.historyIdx < this.cmdHistory.length - 1) {
        this.historyIdx++;
        this.command = this.cmdHistory[this.historyIdx];
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (this.historyIdx > 0) {
        this.historyIdx--;
        this.command = this.cmdHistory[this.historyIdx];
      } else {
        this.historyIdx = -1;
        this.command = '';
      }
    }
  }

  clearHistory(): void { this.history = []; }

  private scrollBottom(): void {
    setTimeout(() => {
      const el = this.termOutput?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }

  private formatOutput(raw: any): string {
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw)) return raw.join('\n');
    return JSON.stringify(raw, null, 2);
  }

  private now(): string {
    return new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  selectedOltName(): string {
    return this.olts.find(o => o.id === this.selectedOltId)?.name ?? '';
  }
}
