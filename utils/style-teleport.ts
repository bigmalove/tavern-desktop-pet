/**
 * 将 iframe 内的样式传送到父窗口的 <head> 中
 * 这样脚本通过 jQuery 或 Vue 添加到酒馆页面的 DOM 才能正确应用样式
 */
export function teleport_style(): void {
  // 避免热重载/重复加载导致多份样式堆叠
  deteleport_style();
  $(`<div>`)
    .attr('script_id', getScriptId())
    .append($(`head > style`, document).clone())
    .appendTo('head');
}

/**
 * 移除传送到父窗口的样式
 */
export function deteleport_style(): void {
  $(`head > div[script_id="${getScriptId()}"]`).remove();
}
