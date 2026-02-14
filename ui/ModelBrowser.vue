<template>
  <div class="model-browser">
    <div class="browser-header">
      <span class="browser-title">在线模型库</span>
      <span class="browser-hint">Eikanya/Live2d-model</span>
    </div>

    <!-- 搜索框 -->
    <div class="search-box">
      <input
        type="text"
        v-model="searchQuery"
        placeholder="搜索已加载的目录..."
      />
    </div>

    <!-- 错误提示 -->
    <div v-if="errorMsg" class="error-bar">
      <span>{{ errorMsg }}</span>
      <button class="retry-btn" @click="loadRoot">重试</button>
    </div>

    <!-- 树形列表 -->
    <div class="tree-container">
      <div v-if="rootLoading" class="loading-state">
        <span class="spinner"></span> 加载中...
      </div>
      <template v-else>
        <TreeNode
          v-for="entry in filteredRootEntries"
          :key="entry.path"
          :entry="entry"
          :depth="0"
          :search-query="searchQuery"
          @select-model="onSelectModel"
        />
        <div v-if="rootEntries.length === 0 && !rootLoading" class="empty-state">
          该目录下暂无内容
        </div>
      </template>
    </div>

    <!-- 已选模型 & 操作 -->
    <div class="browser-footer">
      <div class="selected-info" v-if="selectedPath">
        已选: <span class="selected-path">{{ selectedName }}</span>
      </div>
      <div class="selected-info" v-else>
        <span class="no-selection">请选择一个模型文件</span>
      </div>
      <div class="footer-actions">
        <button class="btn btn-secondary" @click="$emit('cancel')">取消</button>
        <button
          class="btn btn-primary"
          :disabled="!selectedPath"
          @click="confirmLoad"
        >
          确认加载
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { fetchDirectory, buildCdnUrl, RateLimitError } from '../live2d/model-browser';
import type { RepoEntry } from '../live2d/model-browser';
import TreeNode from './TreeNode.vue';

const props = defineProps<{
  useCdn: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  'load-model': [url: string];
}>();

const rootEntries = ref<RepoEntry[]>([]);
const rootLoading = ref(false);
const errorMsg = ref('');
const searchQuery = ref('');
const selectedPath = ref('');

const selectedName = computed(() => {
  if (!selectedPath.value) return '';
  const parts = selectedPath.value.split('/');
  return parts[parts.length - 1];
});

const filteredRootEntries = computed(() => {
  if (!searchQuery.value.trim()) return rootEntries.value;
  const q = searchQuery.value.toLowerCase();
  return rootEntries.value.filter(e => e.name.toLowerCase().includes(q));
});

function onSelectModel(path: string) {
  selectedPath.value = path;
}

function confirmLoad() {
  if (!selectedPath.value) return;
  const cdnUrl = buildCdnUrl(selectedPath.value, props.useCdn);
  emit('load-model', cdnUrl);
}

async function loadRoot() {
  rootLoading.value = true;
  errorMsg.value = '';
  try {
    rootEntries.value = await fetchDirectory('');
  } catch (e: any) {
    if (e instanceof RateLimitError) {
      errorMsg.value = e.message;
    } else {
      errorMsg.value = `加载失败: ${e.message || '网络错误'}`;
    }
  } finally {
    rootLoading.value = false;
  }
}

// 初始加载根目录
loadRoot();
</script>

<style lang="scss" scoped>
@use './styles/theme-arknights.scss' as theme;

.model-browser {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 60vh;
  color: theme.$ark-text-main;
  font-family: theme.$font-cn;
}

.browser-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0 10px;
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(255, 225, 0, 0.35);

  .browser-title {
    font-size: 14px;
    font-family: theme.$font-en;
    letter-spacing: 0.08em;
    color: theme.$ark-accent-yellow;
  }

  .browser-hint {
    font-size: 10px;
    color: theme.$ark-text-sub;
    letter-spacing: 0.08em;
  }
}

.search-box {
  margin-bottom: 10px;

  input {
    @include theme.ark-input-base;
    color: #fff;
  }
}

.error-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(255, 59, 48, 0.12);
  border: 1px solid rgba(255, 59, 48, 0.4);
  margin-bottom: 10px;
  font-size: 12px;
  color: #ffc9c5;

  .retry-btn {
    @include theme.ark-button-base;
    min-width: 72px;
    height: 26px;
    padding: 0 8px;
    font-size: 11px;
    border-color: rgba(255, 59, 48, 0.6);
    color: #ffc9c5;

    &:hover {
      background: theme.$ark-danger;
      border-color: theme.$ark-danger;
      color: #fff;
    }
  }
}

.tree-container {
  flex: 1;
  overflow-y: auto;
  min-height: 150px;
  padding: 4px 0 6px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.3);
  @include theme.ark-scrollbar;

  &:empty {
    border-style: dashed;
  }
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: theme.$ark-text-sub;
  font-size: 13px;
  gap: 8px;
}

.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid #4d4d4d;
  border-top-color: theme.$ark-accent-cyan;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-state {
  text-align: center;
  padding: 24px;
  color: theme.$ark-text-sub;
  font-size: 13px;
}

.browser-footer {
  border-top: 1px solid rgba(255, 255, 255, 0.16);
  padding-top: 12px;
  margin-top: 10px;

  .selected-info {
    font-size: 12px;
    color: #d5d5d5;
    margin-bottom: 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    .selected-path {
      color: theme.$ark-accent-yellow;
      font-weight: 600;
    }

    .no-selection {
      color: theme.$ark-text-sub;
    }
  }

  .footer-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
}

.btn {
  @include theme.ark-button-base;
  min-width: 90px;
  height: 32px;
  padding: 0 14px;
  font-size: 12px;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &.btn-primary {
    background: theme.$ark-accent-yellow;
    color: #000;
    border-color: theme.$ark-accent-yellow;

    &:hover:not(:disabled) {
      background: #fff26e;
      border-color: #fff26e;
    }
  }

  &.btn-secondary {
    background: rgba(0, 218, 194, 0.08);
    border-color: rgba(0, 218, 194, 0.55);
    color: #c5fff9;

    &:hover {
      background: theme.$ark-accent-cyan;
      border-color: theme.$ark-accent-cyan;
      color: #000;
    }
  }
}
</style>
