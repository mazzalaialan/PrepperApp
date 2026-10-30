import { create } from 'zustand';
import { isUnlocked, onSessionChange } from './session';
import {
  changePassword,
  initializeVault,
  isVaultInitialized,
  lockVault,
  unlockWithPassword,
  unlockWithRecoveryKey,
} from './vault';

export type VaultStatus = 'loading' | 'uninitialized' | 'locked' | 'unlocked';

interface VaultState {
  status: VaultStatus;
  setupInProgress: boolean;
  /** Clave recién generada que la UI debe mostrar antes de entrar a la app. */
  pendingRecoveryKey: string | null;
  /** Se desbloqueó con la clave de recuperación: hay que definir contraseña nueva. */
  mustChangePassword: boolean;
  refresh: () => Promise<void>;
  create: (password: string) => Promise<void>;
  acknowledgeRecoveryKey: () => void;
  unlock: (password: string) => Promise<void>;
  recover: (recoveryKey: string) => Promise<void>;
  setNewPassword: (password: string) => Promise<void>;
  lock: () => void;
}

export const useVault = create<VaultState>((set, get) => ({
  status: 'loading',
  setupInProgress: false,
  pendingRecoveryKey: null,
  mustChangePassword: false,
  async refresh() {
    if (isUnlocked()) return set({ status: 'unlocked' });
    set({ status: (await isVaultInitialized()) ? 'locked' : 'uninitialized' });
  },
  async create(password) {
    // La bóveda queda desbloqueada antes de tener la clave: el flag evita mostrar la app en ese instante.
    set({ setupInProgress: true });
    try {
      set({ pendingRecoveryKey: await initializeVault(password) });
    } finally {
      set({ setupInProgress: false });
    }
  },
  acknowledgeRecoveryKey() {
    set({ pendingRecoveryKey: null });
  },
  async unlock(password) {
    await unlockWithPassword(password);
  },
  async recover(recoveryKey) {
    set({ mustChangePassword: true });
    try {
      await unlockWithRecoveryKey(recoveryKey);
    } catch (e) {
      set({ mustChangePassword: false });
      throw e;
    }
  },
  async setNewPassword(password) {
    await changePassword(password);
    set({ mustChangePassword: false });
  },
  lock() {
    lockVault();
    if (get().mustChangePassword) set({ mustChangePassword: false });
  },
}));

onSessionChange(() => void useVault.getState().refresh());
