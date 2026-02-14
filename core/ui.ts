import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * 仅用于 UI 状态（不持久化）
 */
export const useUiStore = defineStore('desktop-pet-ui', () => {
  const showSettings = ref(false);

  function openSettings(): void {
    showSettings.value = true;
  }

  function closeSettings(): void {
    showSettings.value = false;
  }

  return { showSettings, openSettings, closeSettings };
});

