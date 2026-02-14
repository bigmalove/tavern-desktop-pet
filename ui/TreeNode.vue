<template>
  <div class="tree-node">
    <div
      class="node-row"
      :style="{ paddingLeft: depth * 16 + 'px' }"
      :class="{ 'is-model': entry.isModel, 'is-selected': isSelected }"
      @click="handleClick"
    >
      <!-- 展开/折叠箭头（仅目录） -->
      <span v-if="entry.type === 'dir'" class="expand-icon" :class="{ expanded }">
        ▶
      </span>
      <span v-else class="expand-icon placeholder"></span>

      <!-- 图标 -->
      <span class="node-icon">
        <template v-if="entry.type === 'dir'">📁</template>
        <template v-else-if="entry.isModel">⭐</template>
        <template v-else>📄</template>
      </span>

      <!-- 名称 -->
      <span class="node-name" :title="entry.path">{{ entry.name }}</span>

      <!-- 加载指示器 -->
      <span v-if="loading" class="node-spinner"></span>
    </div>

    <!-- 子节点 -->
    <template v-if="expanded && children.length > 0">
      <TreeNode
        v-for="child in filteredChildren"
        :key="child.path"
        :entry="child"
        :depth="depth + 1"
        :search-query="searchQuery"
        @select-model="$emit('select-model', $event)"
      />
    </template>

    <!-- 子目录为空 -->
    <div
      v-if="expanded && !loading && children.length === 0 && loadedOnce"
      class="empty-hint"
      :style="{ paddingLeft: (depth + 1) * 16 + 8 + 'px' }"
    >
      暂无模型文件
    </div>

    <!-- 子目录加载错误 -->
    <div
      v-if="expanded && childError"
      class="child-error"
      :style="{ paddingLeft: (depth + 1) * 16 + 8 + 'px' }"
    >
      {{ childError }}
      <button class="retry-link" @click.stop="loadChildren">重试</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { fetchDirectory, RateLimitError } from '../live2d/model-browser';
import type { RepoEntry } from '../live2d/model-browser';

const props = defineProps<{
  entry: RepoEntry;
  depth: number;
  searchQuery: string;
}>();

const emit = defineEmits<{
  'select-model': [path: string];
}>();

const expanded = ref(false);
const children = ref<RepoEntry[]>([]);
const loading = ref(false);
const loadedOnce = ref(false);
const childError = ref('');
const isSelected = ref(false);

const filteredChildren = computed(() => {
  if (!props.searchQuery.trim()) return children.value;
  const q = props.searchQuery.toLowerCase();
  return children.value.filter(c =>
    c.name.toLowerCase().includes(q) || c.type === 'dir'
  );
});

async function loadChildren() {
  loading.value = true;
  childError.value = '';
  try {
    children.value = await fetchDirectory(props.entry.path);
    loadedOnce.value = true;
  } catch (e: any) {
    if (e instanceof RateLimitError) {
      childError.value = e.message;
    } else {
      childError.value = `加载失败: ${e.message || '网络错误'}`;
    }
  } finally {
    loading.value = false;
  }
}

function handleClick() {
  if (props.entry.type === 'dir') {
    expanded.value = !expanded.value;
    if (expanded.value && !loadedOnce.value) {
      loadChildren();
    }
  } else if (props.entry.isModel) {
    isSelected.value = true;
    emit('select-model', props.entry.path);
  }
}
</script>

<style lang="scss" scoped>
@use './styles/theme-arknights.scss' as theme;

.node-row {
  display: flex;
  align-items: center;
  padding: 5px 8px;
  cursor: pointer;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 12px;
  gap: 4px;
  user-select: none;
  transition: background 0.14s;

  &:hover {
    background: rgba(255, 225, 0, 0.12);
  }

  &.is-model {
    .node-name {
      color: theme.$ark-accent-cyan;
      font-weight: 600;
    }
  }

  &.is-selected {
    background: rgba(255, 225, 0, 0.2);
  }
}

.expand-icon {
  width: 14px;
  font-size: 8px;
  color: theme.$ark-text-sub;
  transition: transform 0.2s;
  flex-shrink: 0;
  text-align: center;

  &.expanded {
    transform: rotate(90deg);
  }

  &.placeholder {
    visibility: hidden;
  }
}

.node-icon {
  font-size: 13px;
  flex-shrink: 0;
  line-height: 1;
}

.node-name {
  color: #f1f1f1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.node-spinner {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 1.5px solid #4d4d4d;
  border-top-color: theme.$ark-accent-cyan;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
  margin-left: 4px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-hint {
  font-size: 11px;
  color: theme.$ark-text-sub;
  padding: 4px 8px;
}

.child-error {
  font-size: 11px;
  color: #ffb5af;
  padding: 4px 8px;

  .retry-link {
    @include theme.ark-button-base;
    height: 22px;
    min-width: 56px;
    padding: 0 8px;
    margin-left: 6px;
    font-size: 10px;
    border-color: rgba(0, 218, 194, 0.55);
    color: #c5fff9;
    cursor: pointer;

    &:hover {
      background: theme.$ark-accent-cyan;
      border-color: theme.$ark-accent-cyan;
      color: #000;
    }
  }
}
</style>
