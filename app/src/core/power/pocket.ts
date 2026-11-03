import { create } from 'zustand';

/**
 * Pantalla negra (modo bolsillo): mientras se graba o se sigue un track, la
 * pantalla queda encendida para que el navegador no corte el GPS, pero en
 * negro (en pantallas OLED casi no gasta) y sin dibujar el mapa.
 */
export const usePocket = create<{ on: boolean; set: (on: boolean) => void }>((set) => ({
  on: false,
  set: (on) => set({ on }),
}));
