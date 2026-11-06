/**
 * Stores que cargan sus datos al desbloquear la bóveda (onSessionChange) o que
 * quedan escuchando cambios (grabador de tracks, avisos). Se importan al
 * arrancar, aunque las pantallas que los usan se carguen recién al abrirlas.
 */
import '@/modules/emergency/store';
import '@/modules/inventory/store';
import '@/modules/recommendations/store';
import '@/modules/tracks/store';
import '@/modules/tracks/recorder';
import '@/modules/garden/store';
import '@/modules/documents/store';
import '@/modules/maps/store';
import '@/modules/firstAid/medicalStore';
import '@/modules/library/store';
import '@/modules/waypoints/store';
import '@/core/notifications/notifications';
