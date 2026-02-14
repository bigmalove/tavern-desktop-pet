import { SCRIPT_NAME } from '../core/constants';

/**
 * 在父窗口创建一个 DOM 元素并添加到 body
 */
export function createContainer(id: string): JQuery<HTMLElement> {
  // 先移除可能存在的旧容器
  $(`#${id}`).remove();
  return $(`<div id="${id}">`).appendTo('body');
}

/**
 * 移除指定 ID 的容器
 */
export function removeContainer(id: string): void {
  $(`#${id}`).remove();
}

function getTargetConsole(): Console {
  try {
    const top = window.parent ?? window;
    if (top.console) return top.console;
  } catch {
    // ignore
  }
  return console;
}

/**
 * 日志输出辅助
 */
export function log(...args: unknown[]): void {
  getTargetConsole().log(`[${SCRIPT_NAME}]`, ...args);
}

export function warn(...args: unknown[]): void {
  getTargetConsole().warn(`[${SCRIPT_NAME}]`, ...args);
}

export function error(...args: unknown[]): void {
  getTargetConsole().error(`[${SCRIPT_NAME}]`, ...args);
}
