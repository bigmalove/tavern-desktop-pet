import type { EmotionTag } from '../core/constants';
import type { EmotionMotionOverride } from '../core/emotion';

export const EXPRESSION_LIVE2D_MAP: Record<
  EmotionTag,
  {
    expressions: string[];
    motions: string[];
  }
> = {
  默认: {
    expressions: ['normal', 'default', 'neutral', 'idle', 'base'],
    motions: ['idle', 'normal', 'wait', 'default', 'stand'],
  },
  微笑: {
    expressions: ['smile', 'happy', 'joy', 'glad', 'pleased'],
    motions: ['happy', 'smile', 'joy', 'weixiao', 'xiao', '微笑'],
  },
  生气: {
    expressions: ['angry', 'anger', 'mad', 'rage', 'annoyed'],
    motions: ['angry', 'rage', 'mad', 'shengqi', 'duqi', '生气'],
  },
  难过: {
    expressions: ['sad', 'sorrow', 'cry', 'upset', 'depressed'],
    motions: ['sad', 'cry', 'sorrow', 'nanguo', 'leiw', '难过'],
  },
  惊讶: {
    expressions: ['surprised', 'shock', 'amazed', 'wow', 'astonished'],
    motions: ['surprised', 'shock', 'amazed', 'jingya', 'jingxi', '惊讶'],
  },
  嘲讽: {
    expressions: ['smirk', 'mock', 'sneer', 'tease', 'sarcastic'],
    motions: ['mock', 'tease', 'tiaoxi', '嘲讽'],
  },
  害羞: {
    expressions: ['shy', 'blush', 'embarrassed', 'bashful', 'timid'],
    motions: ['shy', 'embarrassed', 'blush', 'haixiu', 'shame', '害羞'],
  },
  思考: {
    expressions: ['think', 'ponder', 'confused', 'wonder', 'curious'],
    motions: ['think', 'ponder', 'wonder', 'sikao', '思考'],
  },
  大笑: {
    expressions: ['laugh', 'lol', 'haha', 'giggle', 'rofl'],
    motions: ['laugh', 'giggle', 'haha', 'daxiao', 'oowarai', '大笑'],
  },
  搞怪: {
    expressions: ['playful', 'wink', 'silly', 'fun', 'mischievous'],
    motions: ['playful', 'wink', 'fun', 'gaoguai', 'silly', '搞怪'],
  },
};

function uniquePush(list: string[], seen: Set<string>, value: unknown): void {
  const normalized = String(value ?? '').trim();
  if (!normalized || seen.has(normalized)) return;
  seen.add(normalized);
  list.push(normalized);
}

function uniquePushAllowEmpty(list: string[], seen: Set<string>, value: unknown): void {
  const raw = String(value ?? '');
  const normalized = raw.trim();
  if (!normalized && raw !== '') return;
  const finalValue = normalized || '';
  if (seen.has(finalValue)) return;
  seen.add(finalValue);
  list.push(finalValue);
}

export type Live2DMotionEntry = {
  group: string;
  index: number;
  name: string;
};

function uniqueMotionPush(list: Live2DMotionEntry[], seen: Set<string>, entry: Live2DMotionEntry): void {
  const group = String(entry.group ?? '');
  const index = Number.isFinite(entry.index) ? Math.max(0, Math.floor(entry.index)) : 0;
  const name = String(entry.name ?? '').trim();
  if (!name) return;
  const key = `${group}#${index}#${name.toLowerCase()}`;
  if (seen.has(key)) return;
  seen.add(key);
  list.push({ group, index, name });
}

function normalizeFileStem(input: unknown): string {
  const raw = String(input ?? '').trim();
  if (!raw) return '';

  const noHash = raw.split('#')[0];
  const noQuery = noHash.split('?')[0];
  const filePart = noQuery.split('/').pop() || noQuery;
  let decoded = filePart;
  try {
    decoded = decodeURIComponent(filePart);
  } catch {
    // ignore
  }

  return decoded
    .replace(/\.exp3\.json$/i, '')
    .replace(/\.motion3\.json$/i, '')
    .replace(/\.mtn$/i, '')
    .replace(/\.json$/i, '')
    .trim();
}

function normalizeDefinitionName(def: unknown, fallback = ''): string {
  if (typeof def === 'string') {
    return normalizeFileStem(def) || def.trim();
  }
  if (!def || typeof def !== 'object') {
    return fallback;
  }

  const obj = def as any;
  const directName = obj.Name || obj.name || obj.Id || obj.id || '';
  if (String(directName ?? '').trim()) {
    return String(directName).trim();
  }

  const fileLike = obj.File || obj.file || obj.Path || obj.path || '';
  const stem = normalizeFileStem(fileLike);
  if (stem) return stem;

  return fallback;
}

function collectSettingsCandidates(model: any): any[] {
  const candidates: any[] = [];
  const seen = new Set<any>();

  const add = (obj: any) => {
    if (!obj || typeof obj !== 'object') return;
    if (seen.has(obj)) return;
    seen.add(obj);
    candidates.push(obj);
  };

  const motionManager = model?.internalModel?.motionManager;
  const settings = model?.internalModel?.settings;

  add(settings);
  add(settings?.json);
  add(settings?.rawSettings);
  add(settings?.modelJson);
  add(motionManager?.settings);
  add(motionManager?.settings?.json);
  add(motionManager?.settings?.rawSettings);
  add(motionManager?.settings?.modelJson);

  return candidates;
}

function isExpressionFileLike(input: unknown): boolean {
  const raw = String(input ?? '').trim().toLowerCase();
  if (!raw) return false;
  return /\.exp3\.json($|[?#])/.test(raw) || /\.exp\.json($|[?#])/.test(raw) || /\.exp($|[?#])/.test(raw);
}

function isMotionFileLike(input: unknown): boolean {
  const raw = String(input ?? '').trim().toLowerCase();
  if (!raw) return false;
  return /\.motion3\.json($|[?#])/.test(raw) || /\.mtn($|[?#])/.test(raw);
}

function isMotionDefinition(node: unknown): boolean {
  if (typeof node === 'string') {
    return isMotionFileLike(node);
  }
  if (!node || typeof node !== 'object') return false;

  const obj = node as any;
  const fileLike = obj.File || obj.file || obj.Path || obj.path || '';
  if (isMotionFileLike(fileLike)) return true;

  const soundLike = obj.Sound || obj.sound || '';
  if (typeof soundLike === 'string' && soundLike.trim()) {
    return true;
  }

  return false;
}

function countMotionDefinitions(list: unknown[]): number {
  let count = 0;
  for (const item of list) {
    if (isMotionDefinition(item)) count++;
  }
  return count > 0 ? count : list.length;
}

function mergeGroupCount(target: Record<string, number>, key: unknown, count: unknown): void {
  const keyRaw = String(key ?? '');
  const normalized = keyRaw.trim();
  if (!normalized && keyRaw !== '') return;

  const groupName = normalized || '';
  const parsedCount = Number(count);
  const safeCount = Number.isFinite(parsedCount) && parsedCount > 0 ? Math.max(1, Math.floor(parsedCount)) : 1;
  const prev = target[groupName];
  target[groupName] = Number.isFinite(prev) && prev > 0 ? Math.max(prev, safeCount) : safeCount;
}

function pushFromContainer(names: string[], seen: Set<string>, container: unknown, fallbackPrefix: string): void {
  const pushFromList = (list: unknown[], fallbackPrefixInner: string) => {
    for (let i = 0; i < list.length; i++) {
      const normalized = normalizeDefinitionName(list[i], `${fallbackPrefixInner}_${i + 1}`);
      uniquePush(names, seen, normalized);
    }
  };

  if (Array.isArray(container)) {
    pushFromList(container, fallbackPrefix);
    return;
  }
  if (!container || typeof container !== 'object') return;

  let i = 0;
  for (const [key, value] of Object.entries(container as Record<string, unknown>)) {
    const fallbackName = normalizeFileStem(key) || String(key || '').trim() || `${fallbackPrefix}_${i + 1}`;
    const normalized = normalizeDefinitionName(value, fallbackName);
    uniquePush(names, seen, normalized || fallbackName);
    i++;
  }
}

export function collectExpressionNamesFromUnknown(raw: unknown): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const visited = new Set<any>();

  const visit = (node: unknown, context = ''): void => {
    if (node == null) return;

    if (typeof node === 'string') {
      const text = node.trim();
      if (!text) return;
      if (isExpressionFileLike(text) || /exp|expression/.test(context)) {
        uniquePush(names, seen, normalizeFileStem(text) || text);
      }
      return;
    }

    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        const item = node[i];
        const fallback = `${context || 'expression'}_${i + 1}`;
        if (typeof item === 'string') {
          if (isExpressionFileLike(item) || /exp|expression/.test(context)) {
            uniquePush(names, seen, normalizeFileStem(item) || item);
          }
          continue;
        }

        if (item && typeof item === 'object') {
          const normalized = normalizeDefinitionName(item, fallback);
          const itemAny = item as any;
          const fileLike = itemAny.File || itemAny.file || itemAny.Path || itemAny.path || '';
          if (/exp|expression/.test(context) || isExpressionFileLike(fileLike)) {
            uniquePush(names, seen, normalized || fallback);
          }
        }

        visit(item, context);
      }
      return;
    }

    if (typeof node !== 'object') return;
    if (visited.has(node)) return;
    visited.add(node);

    const obj = node as Record<string, unknown>;
    const anyObj = obj as any;
    const directFile = anyObj.File || anyObj.file || anyObj.Path || anyObj.path || '';
    if (isExpressionFileLike(directFile)) {
      uniquePush(names, seen, normalizeDefinitionName(obj, normalizeFileStem(directFile)));
    }

    for (const [rawKey, value] of Object.entries(obj)) {
      const key = String(rawKey || '').trim();
      if (!key) continue;
      const keyLower = key.toLowerCase();
      const keyIsExpression = keyLower.includes('expression') || keyLower.includes('expr') || keyLower === 'exp';
      const nextContext = keyIsExpression ? 'expression' : context;

      if (typeof value === 'string') {
        const text = value.trim();
        if (!text) continue;
        if (isExpressionFileLike(text) || keyIsExpression || /exp|expression/.test(context)) {
          const fallback = normalizeFileStem(key) || key;
          const normalized = normalizeDefinitionName({ Name: fallback, File: text }, fallback);
          uniquePush(names, seen, normalized || fallback);
        }
        continue;
      }

      if (Array.isArray(value)) {
        if (keyIsExpression || /exp|expression/.test(context)) {
          pushFromContainer(names, seen, value, normalizeFileStem(key) || 'expression');
        }
        visit(value, nextContext);
        continue;
      }

      if (value && typeof value === 'object') {
        if (keyIsExpression) {
          const fallback = normalizeFileStem(key) || key;
          uniquePush(names, seen, normalizeDefinitionName(value, fallback));
        }
        visit(value, nextContext);
      }
    }
  };

  visit(raw, '');
  return names;
}

export function collectMotionGroupCountsFromUnknown(raw: unknown): Record<string, number> {
  const groups: Record<string, number> = {};
  const visited = new Set<any>();

  const visit = (node: unknown, parentKey = '', context = ''): void => {
    if (node == null) return;

    if (Array.isArray(node)) {
      const count = countMotionDefinitions(node);
      if ((parentKey === '' || !!parentKey) && count > 0 && (context === 'motion' || node.some(item => isMotionDefinition(item)))) {
        mergeGroupCount(groups, parentKey, count);
      }

      for (const item of node) {
        if (item && typeof item === 'object') {
          visit(item, parentKey, context);
        }
      }
      return;
    }

    if (typeof node !== 'object') return;
    if (visited.has(node)) return;
    visited.add(node);

    const obj = node as Record<string, unknown>;
    for (const [rawKey, value] of Object.entries(obj)) {
      const keyRaw = String(rawKey ?? '');
      const keyTrimmed = keyRaw.trim();
      const key = keyTrimmed || (keyRaw === '' ? '' : '');
      if (!key && keyRaw !== '') continue;

      const keyLower = key.toLowerCase();
      const keyIsMotionContainer =
        keyLower.includes('motions') ||
        keyLower.includes('motion') ||
        keyLower.includes('anim') ||
        keyLower.includes('mtn');
      const nextContext = keyIsMotionContainer ? 'motion' : context;

      if (Array.isArray(value)) {
        const count = countMotionDefinitions(value);
        if (count > 0 && (nextContext === 'motion' || value.some(item => isMotionDefinition(item)))) {
          mergeGroupCount(groups, key, count);
        }
        visit(value, key, nextContext);
        continue;
      }

      if (typeof value === 'string') {
        if (isMotionFileLike(value) && parentKey) {
          mergeGroupCount(groups, parentKey, 1);
        }
        continue;
      }

      if (value && typeof value === 'object') {
        if (keyIsMotionContainer) {
          const nested = value as Record<string, unknown>;
          for (const [nestedRawKey, nestedValue] of Object.entries(nested)) {
            const nestedRaw = String(nestedRawKey ?? '');
            const nestedTrimmed = nestedRaw.trim();
            const nestedKey = nestedTrimmed || (nestedRaw === '' ? '' : '');
            if (!nestedKey && nestedRaw !== '') continue;
            if (!Array.isArray(nestedValue)) continue;
            const nestedCount = countMotionDefinitions(nestedValue);
            if (nestedCount > 0) {
              mergeGroupCount(groups, nestedKey, nestedCount);
            }
          }
        }
        visit(value, key, nextContext);
      }
    }
  };

  visit(raw, '', '');
  return groups;
}

function pushMotionEntriesFromGroupContainer(entries: Live2DMotionEntry[], seen: Set<string>, container: unknown): void {
  if (!container) return;

  const pushFromList = (group: string, list: unknown[]) => {
    for (let i = 0; i < list.length; i++) {
      const def = list[i];
      if (!isMotionDefinition(def)) continue;
      const name = normalizeDefinitionName(def, `motion_${i + 1}`);
      uniqueMotionPush(entries, seen, { group, index: i, name });
    }
  };

  if (Array.isArray(container)) {
    pushFromList('', container);
    return;
  }

  if (typeof container !== 'object') return;

  for (const [rawKey, value] of Object.entries(container as Record<string, unknown>)) {
    const groupRaw = String(rawKey ?? '');
    const groupTrimmed = groupRaw.trim();
    if (!groupTrimmed && groupRaw !== '') continue;
    const group = groupTrimmed || '';
    if (!Array.isArray(value)) continue;
    pushFromList(group, value);
  }
}

export function collectMotionEntries(model: any): Live2DMotionEntry[] {
  const entries: Live2DMotionEntry[] = [];
  const seen = new Set<string>();

  const motionManager = model?.internalModel?.motionManager;
  pushMotionEntriesFromGroupContainer(entries, seen, motionManager?.definitions);

  const settingsCandidates = collectSettingsCandidates(model);
  for (const settings of settingsCandidates) {
    pushMotionEntriesFromGroupContainer(entries, seen, settings?.motions);
    pushMotionEntriesFromGroupContainer(entries, seen, settings?.Motions);
    pushMotionEntriesFromGroupContainer(entries, seen, settings?.FileReferences?.Motions);
  }

  return entries;
}

export function collectExpressionNames(model: any): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const expressionManager = model?.internalModel?.motionManager?.expressionManager;

  pushFromContainer(names, seen, expressionManager?.definitions, 'definition');
  pushFromContainer(names, seen, expressionManager?.expressions, 'expression');
  for (const name of collectExpressionNamesFromUnknown(expressionManager?.definitions)) {
    uniquePush(names, seen, name);
  }
  for (const name of collectExpressionNamesFromUnknown(expressionManager?.expressions)) {
    uniquePush(names, seen, name);
  }

  const settingsCandidates = collectSettingsCandidates(model);
  for (const settings of settingsCandidates) {
    pushFromContainer(names, seen, settings?.expressions, 'settings_expr');
    pushFromContainer(names, seen, settings?.Expressions, 'settings_expr');
    pushFromContainer(names, seen, settings?.FileReferences?.Expressions, 'file_ref_expr');
    for (const name of collectExpressionNamesFromUnknown(settings)) {
      uniquePush(names, seen, name);
    }
  }

  const settings = model?.internalModel?.settings;
  if (settings && typeof settings === 'object') {
    if (typeof (settings as any).getExpressionCount === 'function') {
      let count = 0;
      try {
        count = Number((settings as any).getExpressionCount()) || 0;
      } catch {
        // ignore
      }
      count = Math.max(0, Math.min(count, 1000));

      for (let i = 0; i < count; i++) {
        let name = '';
        if (typeof (settings as any).getExpressionName === 'function') {
          try {
            name = String((settings as any).getExpressionName(i) ?? '').trim();
          } catch {
            // ignore
          }
        }
        if (!name && typeof (settings as any).getExpressionFile === 'function') {
          try {
            name = normalizeFileStem((settings as any).getExpressionFile(i));
          } catch {
            // ignore
          }
        }
        uniquePush(names, seen, name || `expression_${i + 1}`);
      }
    }
  }

  return names;
}

export function collectMotionGroupNames(model: any): string[] {
  const groupNames: string[] = [];
  const seen = new Set<string>();
  const motionManager = model?.internalModel?.motionManager;

  const pushFromObject = (obj: unknown) => {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      uniquePushAllowEmpty(groupNames, seen, key);
    }
  };

  pushFromObject(motionManager?.motionGroups);
  pushFromObject(motionManager?.groups);
  pushFromObject(motionManager?.definitions);
  for (const [groupName] of Object.entries(collectMotionGroupCountsFromUnknown(motionManager?.definitions))) {
    uniquePushAllowEmpty(groupNames, seen, groupName);
  }

  const settingsCandidates = collectSettingsCandidates(model);
  for (const settings of settingsCandidates) {
    pushFromObject(settings?.motions);
    pushFromObject(settings?.Motions);
    pushFromObject(settings?.FileReferences?.Motions);
    for (const [groupName] of Object.entries(collectMotionGroupCountsFromUnknown(settings))) {
      uniquePushAllowEmpty(groupNames, seen, groupName);
    }
  }

  const settings = model?.internalModel?.settings;
  if (settings && typeof settings === 'object') {
    const anySettings = settings as any;
    if (typeof anySettings.getMotionGroupCount === 'function' && typeof anySettings.getMotionGroupName === 'function') {
      let count = 0;
      try {
        count = Number(anySettings.getMotionGroupCount()) || 0;
      } catch {
        // ignore
      }
      count = Math.max(0, Math.min(count, 1000));

      for (let i = 0; i < count; i++) {
        try {
          uniquePushAllowEmpty(groupNames, seen, String(anySettings.getMotionGroupName(i) ?? ''));
        } catch {
          // ignore
        }
      }
    } else if (typeof anySettings.getMotionGroupNames === 'function') {
      try {
        const names = anySettings.getMotionGroupNames();
        if (Array.isArray(names)) {
          for (const name of names) uniquePushAllowEmpty(groupNames, seen, name);
        }
      } catch {
        // ignore
      }
    }
  }

  return groupNames;
}

export function matchLive2DExpression(model: any, targetExpression: EmotionTag, override?: string): string | null {
  const overrideName = String(override || '').trim();
  if (overrideName) return overrideName;

  const mapping = EXPRESSION_LIVE2D_MAP[targetExpression];
  const candidates = mapping?.expressions || [String(targetExpression || '').toLowerCase()];

  const definitions = collectExpressionNames(model);
  if (!definitions.length) return null;

  for (const candidateRaw of candidates) {
    const candidate = String(candidateRaw || '').toLowerCase();
    const exact = definitions.find((def) => String(def || '').toLowerCase() === candidate);
    if (exact) return exact;
  }

  for (const candidateRaw of candidates) {
    const candidate = String(candidateRaw || '').toLowerCase();
    for (const def of definitions) {
      const name = String(def || '').toLowerCase();
      if (name.includes(candidate) || candidate.includes(name)) {
        return def;
      }
    }
  }

  return null;
}

export type Live2DMotionMatch = { group: string; index: number; name?: string };

export function matchLive2DMotion(
  model: any,
  targetExpression: EmotionTag,
  override?: EmotionMotionOverride,
): Live2DMotionMatch | null {
  if (override && override.enabled === false) return null;

  const overrideGroup = String(override?.group || '').trim();
  if (overrideGroup) {
    const entries = collectMotionEntries(model);
    const lower = overrideGroup.toLowerCase();
    const exactByName = entries.find((e) => e.name.toLowerCase() === lower);
    if (exactByName) return { group: exactByName.group, index: exactByName.index, name: exactByName.name };

    const fuzzyByName = entries.find((e) => {
      const nameLower = e.name.toLowerCase();
      return nameLower.includes(lower) || lower.includes(nameLower);
    });
    if (fuzzyByName) return { group: fuzzyByName.group, index: fuzzyByName.index, name: fuzzyByName.name };

    return { group: overrideGroup, index: 0 };
  }

  const mapping = EXPRESSION_LIVE2D_MAP[targetExpression];
  if (!mapping?.motions?.length) return null;

  const groupNames = collectMotionGroupNames(model);
  if (!groupNames.length) return null;

  for (const candidateRaw of mapping.motions) {
    const candidate = String(candidateRaw || '').trim().toLowerCase();
    if (!candidate) continue;
    const exact = groupNames.find((name) => String(name || '').trim().toLowerCase() === candidate);
    if (exact) {
      return { group: exact, index: 0 };
    }
  }

  for (const candidateRaw of mapping.motions) {
    const candidate = String(candidateRaw || '').toLowerCase();
    if (!candidate) continue;
    for (const groupName of groupNames) {
      const nameLower = String(groupName || '').toLowerCase();
      if (!nameLower) continue;
      if (nameLower.includes(candidate) || candidate.includes(nameLower)) {
        return { group: groupName, index: 0 };
      }
    }
  }

  const entries = collectMotionEntries(model);
  if (!entries.length) return null;

  for (const candidateRaw of mapping.motions) {
    const candidate = String(candidateRaw || '').trim().toLowerCase();
    if (!candidate) continue;
    const exact = entries.find((e) => e.name.toLowerCase() === candidate);
    if (exact) return { group: exact.group, index: exact.index, name: exact.name };
  }

  for (const candidateRaw of mapping.motions) {
    const candidate = String(candidateRaw || '').trim().toLowerCase();
    if (!candidate) continue;
    const fuzzy = entries.find((e) => {
      const nameLower = e.name.toLowerCase();
      return nameLower.includes(candidate) || candidate.includes(nameLower);
    });
    if (fuzzy) return { group: fuzzy.group, index: fuzzy.index, name: fuzzy.name };
  }

  return null;
}
