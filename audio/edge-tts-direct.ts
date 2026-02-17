import type { TTSSpeakerVoice } from './tts-config';

const EDGE_BASE_URL = 'speech.platform.bing.com/consumer/speech/synthesize/readaloud';
const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM_FULL_VERSION = '143.0.3537.57';

const WSS_URL = `wss://${EDGE_BASE_URL}/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;
const VOICE_LIST_URL = `https://${EDGE_BASE_URL}/voices/list?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`;
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;

const WIN_EPOCH_SECONDS = 11644473600;
const SECONDS_TO_NANOSECONDS = 1e9;

const DEFAULT_RATE = '+0%';
const DEFAULT_VOLUME = '+0%';
const DEFAULT_PITCH = '+0Hz';

let clockSkewSeconds = 0;

type EdgeVoiceApiItem = {
  ShortName?: string;
  FriendlyName?: string;
  Locale?: string;
  Gender?: string;
};

export type EdgeDirectSynthesisOptions = {
  signal?: AbortSignal;
  onSocket?: (socket: WebSocket | null) => void;
  timeoutMs?: number;
};

type EdgeTimestampMode = 'utc_string' | 'iso_compact';

type EdgeSecurityParams = {
  secMsGec: string;
  secMsGecVersion: string;
};

type SecurityBuildResult = {
  security: EdgeSecurityParams | null;
  error: string;
};

const EDGE_FALLBACK_SHORT_VOICES: ReadonlyArray<{ shortName: string; locale: string; gender: string }> = [
  { shortName: 'zh-CN-XiaoxiaoNeural', locale: 'zh-CN', gender: 'Female' },
  { shortName: 'zh-CN-YunxiNeural', locale: 'zh-CN', gender: 'Male' },
  { shortName: 'zh-CN-YunyangNeural', locale: 'zh-CN', gender: 'Male' },
  { shortName: 'zh-CN-XiaoyiNeural', locale: 'zh-CN', gender: 'Female' },
  { shortName: 'en-US-JennyNeural', locale: 'en-US', gender: 'Female' },
  { shortName: 'en-US-AriaNeural', locale: 'en-US', gender: 'Female' },
  { shortName: 'en-US-GuyNeural', locale: 'en-US', gender: 'Male' },
  { shortName: 'ja-JP-NanamiNeural', locale: 'ja-JP', gender: 'Female' },
  { shortName: 'ja-JP-KeitaNeural', locale: 'ja-JP', gender: 'Male' },
];

function toAbortError(message = 'Aborted'): Error {
  try {
    return new DOMException(message, 'AbortError');
  } catch {
    const err = new Error(message);
    (err as any).name = 'AbortError';
    return err;
  }
}

function buildConnectionId(): string {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function dateToString(mode: EdgeTimestampMode = 'utc_string'): string {
  const now = new Date();
  if (mode === 'iso_compact') {
    return now.toISOString().replace(/[-:.]/g, '').slice(0, -1);
  }
  return now.toUTCString().replace('GMT', 'GMT+0000 (Coordinated Universal Time)');
}

function removeIncompatibleCharacters(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const isControl =
      (code >= 0x00 && code <= 0x08) || code === 0x0b || code === 0x0c || (code >= 0x0e && code <= 0x1f);
    out += isControl ? ' ' : text[i];
  }
  return out;
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getVoiceName(voice: TTSSpeakerVoice | string): string {
  if (typeof voice === 'string') return voice.trim();
  return String(voice.value || voice.name || '').trim();
}

export function buildSsml(text: string, voice: TTSSpeakerVoice | string): string {
  const voiceName = getVoiceName(voice);
  const escapedText = escapeXml(removeIncompatibleCharacters(String(text || '')));
  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
    `<voice name='${voiceName}'>` +
    `<prosody pitch='${DEFAULT_PITCH}' rate='${DEFAULT_RATE}' volume='${DEFAULT_VOLUME}'>${escapedText}</prosody>` +
    `</voice>` +
    `</speak>`
  );
}

function buildSpeechConfigMessage(timestamp: string): string {
  return (
    `X-Timestamp:${timestamp}\r\n` +
    `Content-Type:application/json; charset=utf-8\r\n` +
    `Path:speech.config\r\n\r\n` +
    `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n`
  );
}

function buildSsmlMessage(requestId: string, timestamp: string, ssml: string): string {
  return (
    `X-RequestId:${requestId}\r\n` +
    `Content-Type:application/ssml+xml\r\n` +
    `X-Timestamp:${timestamp}Z\r\n` +
    `Path:ssml\r\n\r\n` +
    `${ssml}`
  );
}

function parseHeadersFromTextMessage(textMessage: string): Record<string, string> {
  const headerEndIndex = textMessage.indexOf('\r\n\r\n');
  const headerText = headerEndIndex >= 0 ? textMessage.slice(0, headerEndIndex) : textMessage;
  const headers: Record<string, string> = {};
  for (const line of headerText.split('\r\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    headers[line.slice(0, idx)] = line.slice(idx + 1).trim();
  }
  return headers;
}

function parseHeadersAndDataFromBinaryMessage(binary: Uint8Array): { headers: Record<string, string>; payload: Uint8Array } {
  if (binary.length < 2) return { headers: {}, payload: new Uint8Array(0) };
  const headerLength = (binary[0] << 8) | binary[1];
  if (headerLength <= 0 || headerLength + 2 > binary.length) {
    return { headers: {}, payload: binary.slice(2) };
  }

  const headers: Record<string, string> = {};
  const headerBytes = binary.slice(2, headerLength + 2);
  const headerText = new TextDecoder().decode(headerBytes);
  for (const line of headerText.split('\r\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    headers[line.slice(0, idx)] = line.slice(idx + 1).trim();
  }

  return { headers, payload: binary.slice(headerLength + 2) };
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  if (chunks.length === 0) return new Uint8Array(0);
  if (chunks.length === 1) return chunks[0];
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

async function toSha256HexUpper(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const subtle = globalThis.crypto?.subtle;
  if (subtle?.digest) {
    try {
      const digest = await subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
    } catch {
      // fallback to pure-js implementation
    }
  }
  return sha256HexUpperFallback(bytes);
}

function rotateRight(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

function sha256HexUpperFallback(message: Uint8Array): string {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);

  const H = new Uint32Array([
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ]);

  const withOneByte = message.length + 1;
  const paddedLength = Math.ceil((withOneByte + 8) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(message);
  padded[message.length] = 0x80;

  const bitLength = message.length * 8;
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  padded[paddedLength - 8] = (high >>> 24) & 0xff;
  padded[paddedLength - 7] = (high >>> 16) & 0xff;
  padded[paddedLength - 6] = (high >>> 8) & 0xff;
  padded[paddedLength - 5] = high & 0xff;
  padded[paddedLength - 4] = (low >>> 24) & 0xff;
  padded[paddedLength - 3] = (low >>> 16) & 0xff;
  padded[paddedLength - 2] = (low >>> 8) & 0xff;
  padded[paddedLength - 1] = low & 0xff;

  const w = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] = ((padded[j] << 24) | (padded[j + 1] << 16) | (padded[j + 2] << 8) | padded[j + 3]) >>> 0;
    }

    for (let i = 16; i < 64; i++) {
      const s0 = rotateRight(w[i - 15], 7) ^ rotateRight(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotateRight(w[i - 2], 17) ^ rotateRight(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = H[0];
    let b = H[1];
    let c = H[2];
    let d = H[3];
    let e = H[4];
    let f = H[5];
    let g = H[6];
    let h = H[7];

    for (let i = 0; i < 64; i++) {
      const S1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  return Array.from(H)
    .map(word => word.toString(16).padStart(8, '0'))
    .join('')
    .toUpperCase();
}

async function buildSecurityParamsWithReason(): Promise<SecurityBuildResult> {
  try {
    let ticks = Date.now() / 1000 + clockSkewSeconds;
    ticks += WIN_EPOCH_SECONDS;
    ticks -= ticks % 300;
    ticks *= SECONDS_TO_NANOSECONDS / 100;
    const secMsGec = await toSha256HexUpper(`${ticks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`);
    return {
      security: { secMsGec, secMsGecVersion: SEC_MS_GEC_VERSION },
      error: '',
    };
  } catch (e) {
    return {
      security: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function buildSecurityParams(): Promise<EdgeSecurityParams | null> {
  const { security } = await buildSecurityParamsWithReason();
  return security;
}

function mapEdgeVoice(item: EdgeVoiceApiItem): TTSSpeakerVoice | null {
  const shortName = String(item.ShortName || '').trim();
  if (!shortName) return null;

  const locale = String(item.Locale || '').trim();
  const gender = String(item.Gender || '').trim();
  const friendlyName = String(item.FriendlyName || '').trim();
  const desc = [friendlyName, locale, gender].filter(Boolean).join(' | ');

  return {
    name: shortName,
    value: shortName,
    source: 'edge_tts_direct',
    resourceId: null,
    desc: desc || 'EdgeTTS Direct',
  };
}

function dedupeVoices(list: TTSSpeakerVoice[]): TTSSpeakerVoice[] {
  const seen = new Set<string>();
  const result: TTSSpeakerVoice[] = [];
  for (const voice of list) {
    const key = String(voice.value || voice.name || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(voice);
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

function parseServerDateHeader(response: Response): number | null {
  const date = response.headers.get('date') || response.headers.get('Date');
  if (!date) return null;
  const ts = new Date(date).getTime();
  if (!Number.isFinite(ts)) return null;
  return ts / 1000;
}

async function fetchVoicesOnce(url: string): Promise<TTSSpeakerVoice[]> {
  const response = await fetch(url, {
    headers: {
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  const serverDate = parseServerDateHeader(response);
  if (serverDate !== null) {
    const clientDate = Date.now() / 1000 + clockSkewSeconds;
    clockSkewSeconds += serverDate - clientDate;
  }

  if (!response.ok) {
    throw new Error(`EdgeTTS voices request failed (HTTP ${response.status})`);
  }

  const payload = (await response.json()) as EdgeVoiceApiItem[];
  if (!Array.isArray(payload)) {
    throw new Error('EdgeTTS voices response is not an array');
  }

  const mapped = payload.map(mapEdgeVoice).filter(Boolean) as TTSSpeakerVoice[];
  return dedupeVoices(mapped);
}

export async function fetchEdgeVoices(): Promise<TTSSpeakerVoice[]> {
  const securityResult = await buildSecurityParamsWithReason();
  const security = securityResult.security;
  const urls: string[] = [];

  if (security) {
    urls.push(
      `${VOICE_LIST_URL}&Sec-MS-GEC=${encodeURIComponent(security.secMsGec)}&Sec-MS-GEC-Version=${encodeURIComponent(security.secMsGecVersion)}`,
    );
  }
  urls.push(VOICE_LIST_URL);

  let lastError: unknown = null;
  for (const url of urls) {
    try {
      const voices = await fetchVoicesOnce(url);
      if (voices.length > 0) return voices;
      lastError = new Error('EdgeTTS voices response is empty');
    } catch (e) {
      lastError = e;
    }
  }

  if (!security && securityResult.error) {
    const base = lastError instanceof Error ? lastError.message : String(lastError || 'unknown');
    throw new Error(`EdgeTTS voices request failed. security-unavailable: ${securityResult.error}; last: ${base}`);
  }
  throw lastError instanceof Error ? lastError : new Error('EdgeTTS voices request failed');
}

export function getEdgeFallbackVoices(): TTSSpeakerVoice[] {
  return EDGE_FALLBACK_SHORT_VOICES.map(item => ({
    name: item.shortName,
    value: item.shortName,
    source: 'edge_tts_direct',
    resourceId: null,
    desc: `${item.locale} | ${item.gender}`,
  }));
}

async function synthesizeWithSocketUrl(
  socketUrl: string,
  text: string,
  voiceName: string,
  options: EdgeDirectSynthesisOptions,
  timestampMode: EdgeTimestampMode,
  attemptLabel: string,
): Promise<Blob> {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(3000, Number(options.timeoutMs)) : 25000;

  return new Promise<Blob>((resolve, reject) => {
    let done = false;
    let ws: WebSocket | null = null;
    let timeoutId: number | null = null;
    const chunks: Uint8Array[] = [];
    let sawSocketError = false;
    let sawOpen = false;
    let closeCode = 0;
    let closeReason = '';
    let closeWasClean = false;

    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
      }
      options.onSocket?.(null);
      if (options.signal) {
        options.signal.removeEventListener('abort', onAbort);
      }
      fn();
    };

    const fail = (error: unknown) => {
      finish(() => reject(error instanceof Error ? error : new Error(String(error))));
    };

    const onAbort = () => {
      try {
        ws?.close(1000, 'abort');
      } catch {
        // ignore
      }
      fail(toAbortError('EdgeTTS direct synthesis aborted'));
    };

    if (options.signal?.aborted) {
      fail(toAbortError('EdgeTTS direct synthesis aborted'));
      return;
    }

    if (options.signal) {
      options.signal.addEventListener('abort', onAbort, { once: true });
    }

    ws = new WebSocket(socketUrl);
    ws.binaryType = 'arraybuffer';
    options.onSocket?.(ws);

    timeoutId = window.setTimeout(() => {
      try {
        ws?.close(1013, 'timeout');
      } catch {
        // ignore
      }
      fail(new Error(`EdgeTTS direct websocket timeout (${attemptLabel})`));
    }, timeoutMs);

    ws.onopen = () => {
      sawOpen = true;
      const timestamp = dateToString(timestampMode);
      ws?.send(buildSpeechConfigMessage(timestamp));
      ws?.send(buildSsmlMessage(buildConnectionId(), timestamp, buildSsml(text, voiceName)));
    };

    ws.onmessage = event => {
      if (done) return;

      if (typeof event.data === 'string') {
        const headers = parseHeadersFromTextMessage(event.data);
        const path = String(headers.Path || headers.path || '').toLowerCase();
        if (path === 'turn.end') {
          try {
            ws?.close(1000, 'turn.end');
          } catch {
            // ignore
          }
        }
        return;
      }

      const handleBinary = async () => {
        const data = event.data;
        let bytes: Uint8Array | null = null;

        if (data instanceof ArrayBuffer) {
          bytes = new Uint8Array(data);
        } else if (ArrayBuffer.isView(data)) {
          bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        } else if (data instanceof Blob) {
          bytes = new Uint8Array(await data.arrayBuffer());
        }
        if (!bytes || bytes.length < 2) return;

        const { headers, payload } = parseHeadersAndDataFromBinaryMessage(bytes);
        const path = String(headers.Path || headers.path || '').toLowerCase();
        if (path !== 'audio') return;

        const contentType = String(headers['Content-Type'] || headers['content-type'] || '').toLowerCase();
        if (contentType && !contentType.startsWith('audio/')) return;
        if (payload.length > 0) {
          chunks.push(payload);
        }
      };

      void handleBinary().catch(fail);
    };

    ws.onerror = () => {
      // Browser WebSocket error events don't expose useful details.
      // Keep the event and wait for onclose to obtain close code/reason.
      sawSocketError = true;
    };

    ws.onclose = event => {
      closeCode = event.code;
      closeReason = String(event.reason || '').trim();
      closeWasClean = !!event.wasClean;

      if (done) return;
      if (options.signal?.aborted) {
        fail(toAbortError('EdgeTTS direct synthesis aborted'));
        return;
      }
      if (chunks.length <= 0) {
        fail(
          new Error(
            `No audio frame received from EdgeTTS direct websocket (${attemptLabel}; code=${closeCode}, clean=${closeWasClean}, opened=${sawOpen}, errorEvent=${sawSocketError}, reason=${closeReason || 'n/a'})`,
          ),
        );
        return;
      }

      const merged = concatChunks(chunks);
      const blob = new Blob([merged as unknown as ArrayBufferView], { type: 'audio/mpeg' });
      finish(() => resolve(blob));
    };
  });
}

export async function synthesizeToBlob(
  text: string,
  voice: TTSSpeakerVoice | string,
  options: EdgeDirectSynthesisOptions = {},
): Promise<Blob> {
  const cleanText = removeIncompatibleCharacters(String(text || '')).trim();
  if (!cleanText) {
    throw new Error('EdgeTTS text is empty');
  }

  const voiceName = getVoiceName(voice);
  if (!voiceName) {
    throw new Error('EdgeTTS voice is empty');
  }

  const securityResult = await buildSecurityParamsWithReason();
  const security = securityResult.security;
  const attempts: Array<{ socketUrl: string; timestampMode: EdgeTimestampMode; label: string }> = [];
  if (security) {
    attempts.push({
      socketUrl: `${WSS_URL}&Sec-MS-GEC=${encodeURIComponent(security.secMsGec)}&Sec-MS-GEC-Version=${encodeURIComponent(security.secMsGecVersion)}&ConnectionId=${buildConnectionId()}`,
      timestampMode: 'utc_string',
      label: 'with-sec/utc',
    });
    attempts.push({
      socketUrl: `${WSS_URL}&Sec-MS-GEC=${encodeURIComponent(security.secMsGec)}&Sec-MS-GEC-Version=${encodeURIComponent(security.secMsGecVersion)}&ConnectionId=${buildConnectionId()}`,
      timestampMode: 'iso_compact',
      label: 'with-sec/iso',
    });
  }
  const plainBase = `${WSS_URL}&ConnectionId=${buildConnectionId()}`;
  attempts.push({
    socketUrl: plainBase,
    timestampMode: 'utc_string',
    label: 'plain/utc',
  });
  attempts.push({
    socketUrl: plainBase,
    timestampMode: 'iso_compact',
    label: 'plain/iso',
  });

  let lastError: unknown = null;
  const attemptErrors: string[] = [];
  for (const attempt of attempts) {
    try {
      return await synthesizeWithSocketUrl(
        attempt.socketUrl,
        cleanText,
        voiceName,
        options,
        attempt.timestampMode,
        attempt.label,
      );
    } catch (e) {
      lastError = e;
      const message = e instanceof Error ? e.message : String(e);
      attemptErrors.push(`${attempt.label}: ${message}`);
      if (options.signal?.aborted) {
        throw toAbortError('EdgeTTS direct synthesis aborted');
      }
    }
  }

  if (attemptErrors.length > 0) {
    const ua = String(globalThis.navigator?.userAgent || '');
    const isEdgeUA = /Edg\//i.test(ua);
    const allUnopened = attemptErrors.every(msg => /opened=false/.test(msg));
    const likelyUaRejected = !isEdgeUA && allUnopened;
    const securityHint =
      !security && securityResult.error ? ` security-unavailable=${securityResult.error};` : '';
    const uaHint = likelyUaRejected ? ' likely-cause=ua-not-edg;' : '';
    throw new Error(`EdgeTTS direct synthesis failed.${securityHint}${uaHint} ${attemptErrors.join(' | ')}`);
  }
  throw lastError instanceof Error ? lastError : new Error('EdgeTTS direct synthesis failed');
}
