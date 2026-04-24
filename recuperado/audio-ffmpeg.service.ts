import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

@Injectable({ providedIn: 'root' })
export class AudioFfmpegService {

  private ffmpeg: FFmpeg | null = null;
  private isLoaded = false;
  private isLoading = false;
  private isBrowser = false;

  constructor(@Inject(PLATFORM_ID) platformId: Object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  /**
   * Carga FFmpeg SOLO en navegador
   */
  async preload(): Promise<void> {
    if (!this.isBrowser) {
      console.warn('⚠️ FFmpeg omitido (no browser)');
      return;
    }

    if (this.isLoaded && this.ffmpeg) {
      console.log('✅ FFmpeg ya está listo');
      return;
    }

    if (this.isLoading) {
      console.log('⏳ Esperando carga previa de FFmpeg...');
      let attempts = 0;
      while (this.isLoading && attempts < 300) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
        if (attempts % 10 === 0) {
          console.log(`⏳ Esperando... ${attempts * 100}ms`);
        }
      }
      if (this.isLoaded) {
        console.log('✅ FFmpeg listo después de esperar');
        return;
      }
      console.error('❌ Timeout: FFmpeg tardó más de 30 segundos');
      this.isLoading = false;
      throw new Error('Timeout: FFmpeg no se cargó a tiempo');
    }

    this.isLoading = true;
    console.log('🟡 Cargando FFmpeg...');

    try {
      this.ffmpeg = new FFmpeg();

      this.ffmpeg.on('log', ({ type, message }) => {
        console.log(`[FFmpeg ${type}]`, message);
      });

      this.ffmpeg.on('progress', ({ progress, time }) => {
        console.log(`⏱️ Progreso: ${Math.round(progress * 100)}% | ${time}ms`);
      });

      console.log('📦 Iniciando carga de FFmpeg core...');

      const baseURL = window.location.origin;

      console.log('📍 URLs que se van a cargar:', {
        core: `${baseURL}/assets/ffmpeg/ffmpeg-core.js`,
        wasm: `${baseURL}/assets/ffmpeg/ffmpeg-core.wasm`
      });

      // 🔥 Timeout de 20 segundos para el load
      const loadPromise = this.ffmpeg.load({
        classWorkerURL: `${baseURL}/assets/ffmpeg/worker.js`,
        coreURL: `${baseURL}/assets/ffmpeg/ffmpeg-core.js`,
        wasmURL: `${baseURL}/assets/ffmpeg/ffmpeg-core.wasm`,
      });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Load timeout después de 20s')), 20000)
      );

      await Promise.race([loadPromise, timeoutPromise]);

      this.isLoaded = true;
      console.log('🟢 FFmpeg cargado exitosamente');

    } catch (error) {
      console.error('❌ Error cargando FFmpeg:', error);
      console.error('Stack:', (error as Error).stack);
      
      this.ffmpeg = null;
      this.isLoaded = false;
      
      throw new Error(`FFmpeg falló al cargar: ${error}`);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Convierte audio a OGG OPUS (WhatsApp)
   */
  async toWhatsappOgg(inputFile: File): Promise<File> {
    const startTime = Date.now();
    console.log('🎯 Iniciando conversión...', {
      name: inputFile.name,
      size: `${(inputFile.size / 1024).toFixed(1)} KB`,
      type: inputFile.type
    });

    if (!this.isBrowser) {
      throw new Error('FFmpeg solo disponible en navegador');
    }

    try {
      console.log('1️⃣ Precargando FFmpeg...');
      await this.preload();

      if (!this.ffmpeg || !this.isLoaded) {
        throw new Error('FFmpeg no está listo después de preload');
      }

      const timestamp = Date.now();
      const ext = inputFile.name.split('.').pop() || 'webm';
      const inputName = `input_${timestamp}.${ext}`;
      const outputName = `output_${timestamp}.ogg`;

      console.log('2️⃣ Escribiendo archivo:', inputName);
      const fileData = await fetchFile(inputFile);
      await this.ffmpeg.writeFile(inputName, fileData);

      console.log('3️⃣ Ejecutando conversión FFmpeg...');
      await this.ffmpeg.exec([
        '-i', inputName,
        '-ac', '1',          // Mono
        '-ar', '16000',      // 16kHz (óptimo WhatsApp)
        '-c:a', 'libopus',
        '-b:a', '24k',       // Bitrate bajo
        '-vbr', 'on',
        '-compression_level', '10',
        '-application', 'voip',
        outputName
      ]);

      console.log('4️⃣ Leyendo resultado...');
      const data = await this.ffmpeg.readFile(outputName);

      console.log('5️⃣ Limpiando archivos temporales...');
      try {
        await this.ffmpeg.deleteFile(inputName);
        await this.ffmpeg.deleteFile(outputName);
      } catch (e) {
        console.warn('⚠️ No se pudieron eliminar temporales:', e);
      }

      if (!(data instanceof Uint8Array)) {
        throw new Error('Datos inválidos de FFmpeg');
      }

      console.log('6️⃣ Creando archivo final...');
      const buffer = new ArrayBuffer(data.length);
      new Uint8Array(buffer).set(data);

      const blob = new Blob([buffer], { type: 'audio/ogg; codecs=opus' });
      const file = new File(
        [blob],
        `voice_${timestamp}.ogg`,
        { type: 'audio/ogg; codecs=opus' }
      );

      const elapsed = Date.now() - startTime;
      console.log('✅ Conversión completada', {
        tiempo: `${elapsed}ms`,
        input: `${(inputFile.size / 1024).toFixed(1)} KB`,
        output: `${(file.size / 1024).toFixed(1)} KB`,
        reducción: `${((1 - file.size / inputFile.size) * 100).toFixed(1)}%`
      });

      return file;

    } catch (error) {
      console.error('❌ Error en conversión:', error);
      throw error;
    }
  }
}