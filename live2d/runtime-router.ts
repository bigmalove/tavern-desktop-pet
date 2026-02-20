import type { Live2DRuntimeType } from '../core/constants';

export const LIVE2D_RUNTIME_TYPES = Object.freeze({
  LEGACY: 'legacy' as Live2DRuntimeType,
  CUBISM5: 'cubism5' as Live2DRuntimeType,
});

const RUNTIME_TYPE_SET = new Set<string>(Object.values(LIVE2D_RUNTIME_TYPES));

function parseMajorVersion(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value);
  }

  if (typeof value !== 'string') return null;
  const match = value.trim().match(/(\d+)(?:\.\d+)?/);
  if (!match) return null;
  const major = Number.parseInt(match[1], 10);
  return Number.isFinite(major) ? major : null;
}

export function normalizeCubismVersion(value: unknown): number | null {
  const major = parseMajorVersion(value);
  if (major == null) return null;
  if (major >= 5) return 5;
  if (major >= 3) return 4;
  if (major === 2) return 2;
  return null;
}

export function inferCubismVersionFromModelJson(modelJson: unknown, fallback: unknown = null): number | null {
  if (!modelJson || typeof modelJson !== 'object') {
    return normalizeCubismVersion(fallback);
  }

  const jsonRecord = modelJson as Record<string, any>;
  const directCandidates = [
    jsonRecord.Version,
    jsonRecord.version,
    jsonRecord.Meta?.Version,
    jsonRecord.meta?.version,
  ];

  for (const candidate of directCandidates) {
    const parsed = normalizeCubismVersion(candidate);
    if (parsed != null) return parsed;
  }

  if (jsonRecord.FileReferences && typeof jsonRecord.FileReferences === 'object') {
    return normalizeCubismVersion(fallback) ?? 4;
  }

  if (typeof jsonRecord.model === 'string' || typeof jsonRecord.Model === 'string') {
    return normalizeCubismVersion(fallback) ?? 2;
  }

  return normalizeCubismVersion(fallback);
}

export function normalizeLive2DRuntimeType(
  value: unknown,
  fallback: Live2DRuntimeType | '' = LIVE2D_RUNTIME_TYPES.LEGACY,
): Live2DRuntimeType | '' {
  const normalized = String(value || '').trim().toLowerCase();
  if (RUNTIME_TYPE_SET.has(normalized)) {
    return normalized as Live2DRuntimeType;
  }
  return fallback;
}

export function resolveRuntimeTypeFromCubismVersion(cubismVersion: unknown): Live2DRuntimeType {
  const normalized = normalizeCubismVersion(cubismVersion);
  if (normalized != null && normalized >= 5) {
    return LIVE2D_RUNTIME_TYPES.CUBISM5;
  }
  return LIVE2D_RUNTIME_TYPES.LEGACY;
}

export function resolveLive2DRuntime(modelData: Record<string, any> | null = null): {
  runtimeType: Live2DRuntimeType;
  cubismVersion: number | null;
} {
  const input = modelData && typeof modelData === 'object' ? modelData : {};
  const inferredVersion = inferCubismVersionFromModelJson(input.modelJson, input.cubismVersion);
  const explicitRuntime = normalizeLive2DRuntimeType(input.runtimeType || '', '');
  const runtimeType = explicitRuntime || resolveRuntimeTypeFromCubismVersion(inferredVersion);
  const cubismVersion = inferredVersion ?? (runtimeType === LIVE2D_RUNTIME_TYPES.CUBISM5 ? 5 : null);

  return {
    runtimeType,
    cubismVersion,
  };
}

export function withResolvedLive2DRuntime<T extends Record<string, any>>(modelData: T | null = null): T & {
  runtimeType: Live2DRuntimeType;
  cubismVersion: number | null;
} {
  const input = modelData && typeof modelData === 'object' ? modelData : ({} as T);
  const resolved = resolveLive2DRuntime(input);
  return {
    ...input,
    runtimeType: resolved.runtimeType,
    cubismVersion: resolved.cubismVersion,
  };
}
