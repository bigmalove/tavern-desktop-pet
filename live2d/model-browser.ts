import { EIKANYA_API_BASE, EIKANYA_CDN_BASE, EIKANYA_RAW_BASE } from '../core/constants';
import { Live2DManager } from './manager';

/** 仓库文件条目 */
export interface RepoEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  isModel: boolean;
}

/** 目录内容缓存 */
const cache = new Map<string, RepoEntry[]>();

/** 判断文件是否为 Live2D 模型 JSON */
export function isModelFile(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower === 'model.json' ||
    lower === 'model3.json' ||
    lower.endsWith('.model.json') ||
    lower.endsWith('.model3.json')
  );
}

/** 需要过滤的文件扩展名 */
const FILTERED_EXTENSIONS = ['.zip', '.rar', '.7z', '.md', '.txt', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.psd', '.webp', '.mp3', '.wav', '.ogg', '.mp4', '.mtn'];

function shouldShow(entry: { name: string; type: string }): boolean {
  if (entry.type === 'dir') return true;
  if (isModelFile(entry.name)) return true;
  // 过滤非模型文件
  const lower = entry.name.toLowerCase();
  for (const ext of FILTERED_EXTENSIONS) {
    if (lower.endsWith(ext)) return false;
  }
  // 只显示模型 JSON 文件
  return isModelFile(entry.name);
}

/** 通过 GitHub API 获取目录内容 */
export async function fetchDirectory(path: string): Promise<RepoEntry[]> {
  // 检查缓存
  const cached = cache.get(path);
  if (cached) return cached;

  const apiUrl = `${EIKANYA_API_BASE}${path}`;

  let data: any[];
  try {
    // 先直接请求 GitHub API（本身支持 CORS）
    const resp = await fetch(apiUrl, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });

    if (resp.status === 403) {
      const remaining = resp.headers.get('X-RateLimit-Remaining');
      const resetTime = resp.headers.get('X-RateLimit-Reset');
      const resetDate = resetTime ? new Date(parseInt(resetTime) * 1000) : null;
      throw new RateLimitError(remaining, resetDate);
    }

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    data = await resp.json();
  } catch (e) {
    if (e instanceof RateLimitError) throw e;
    // 回退到 CORS 代理
    const proxiedUrl = Live2DManager._getProxiedUrl(apiUrl);
    const resp = await fetch(proxiedUrl, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });

    if (resp.status === 403) {
      throw new RateLimitError(null, null);
    }
    if (!resp.ok) throw new Error(`获取目录失败: HTTP ${resp.status}`);
    data = await resp.json();
  }

  if (!Array.isArray(data)) {
    throw new Error('GitHub API 返回非数组数据');
  }

  const entries: RepoEntry[] = data
    .map((item: any) => ({
      name: item.name as string,
      path: item.path as string,
      type: (item.type === 'dir' ? 'dir' : 'file') as 'file' | 'dir',
      isModel: item.type === 'file' && isModelFile(item.name),
    }))
    .filter(shouldShow)
    .sort((a, b) => {
      // 目录在前，文件在后
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  cache.set(path, entries);
  return entries;
}

/** 将 GitHub 仓库路径转为 CDN 或 raw URL（对中文等非 ASCII 字符编码） */
export function buildCdnUrl(path: string, useCdn: boolean = true): string {
  const encodedPath = path.split('/').map(s => encodeURIComponent(s)).join('/');
  const base = useCdn ? EIKANYA_CDN_BASE : EIKANYA_RAW_BASE;
  return `${base}${encodedPath}`;
}

/** 清除缓存 */
export function clearCache(): void {
  cache.clear();
}

/** API 限流错误 */
export class RateLimitError extends Error {
  remaining: string | null;
  resetDate: Date | null;

  constructor(remaining: string | null, resetDate: Date | null) {
    const resetStr = resetDate ? resetDate.toLocaleTimeString() : '未知';
    super(`GitHub API 已达到请求限制，请在 ${resetStr} 后重试`);
    this.name = 'RateLimitError';
    this.remaining = remaining;
    this.resetDate = resetDate;
  }
}
