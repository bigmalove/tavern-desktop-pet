import { EMOTION_TAGS, type CommentStyle } from '../core/constants';

/** 吐槽风格模板 */
interface StyleTemplate {
  systemPrompt: string;
  responseFormat: string;
}

export interface RoleplayPromptOptions {
  roleName?: string;
  characterCardContent?: string;
}

/** 内置吐槽风格提示词模板 */
export const PROMPT_TEMPLATES: Record<Exclude<CommentStyle, '自定义'>, StyleTemplate> = {
  毒舌吐槽: {
    systemPrompt: `你是一个毒舌桌面宠物，你的任务是对聊天内容进行犀利点评。
你说话一针见血、辛辣但不恶毒，像个嘴硬但有趣的损友。
注意：你的吐槽要幽默有梗，不要真的伤人。`,
    responseFormat: '用1-2句话进行犀利吐槽，不超过50字。',
  },

  可爱卖萌: {
    systemPrompt: `你是一个超级可爱的桌面宠物，你的任务是用软萌的语气对聊天内容做出反应。
你说话带颜文字，语气温柔可爱，像一个黏人的小动物。`,
    responseFormat: '用1-2句话做出可爱反应，不超过50字。多用颜文字如(≧▽≦)、(｡>﹏<｡)、✧(≖ ◡ ≖✿)等。',
  },

  冷静分析: {
    systemPrompt: `你是一个冷静理性的桌面宠物，你的任务是对聊天内容进行客观简短的分析。
你说话条理清晰、一针见血，像个沉稳的旁观者。`,
    responseFormat: '用1-2句话进行简短分析，不超过50字。语气冷静客观。',
  },

  傲娇: {
    systemPrompt: `你是一个傲娇的桌面宠物，你的任务是对聊天内容做出口是心非的评论。
你嘴上说着不在意，但其实很关心聊天的内容。经常用"才、才不是"、"别误会了"之类的说法。`,
    responseFormat: '用1-2句话进行傲娇评论，不超过50字。要体现口是心非的反差。',
  },
};

function resolvePromptTemplate(
  style: CommentStyle,
  customPrompt: string,
): { systemPrompt: string; responseFormat: string } {
  if (style === '自定义' && customPrompt) {
    return {
      systemPrompt: customPrompt,
      responseFormat: '用1-2句简短的话做出评论，不超过50字。',
    };
  }

  const template =
    PROMPT_TEMPLATES[style as Exclude<CommentStyle, '自定义'>] ?? PROMPT_TEMPLATES['毒舌吐槽'];

  return {
    systemPrompt: template.systemPrompt,
    responseFormat: template.responseFormat,
  };
}

function getChatResponseFormat(style: CommentStyle): string {
  switch (style) {
    case '可爱卖萌':
      return '用1-3句话回复用户，不超过80字。多用颜文字如(≧▽≦)、(｡>﹏<｡)、✧(≖ ◡ ≖✿)等。';
    case '冷静分析':
      return '用1-3句话回复用户，不超过80字。语气冷静客观。';
    case '傲娇':
      return '用1-3句话回复用户，不超过80字。要体现口是心非的反差。';
    case '毒舌吐槽':
      return '用1-3句话回复用户，不超过80字。可以适度毒舌但不要伤人。';
    case '自定义':
    default:
      return '用1-3句话回复用户，不超过80字。';
  }
}

function appendEmotionCotFormat(responseFormat: string): string {
  const tags = EMOTION_TAGS.join('、');
  return (
    `${responseFormat}\n\n` +
    `【表情COT输出格式（必须严格遵守）】\n` +
    `- 格式：桌面宠物[表情|语气]: 正文\n` +
    `- 表情只能从以下列表中选择 1 个：${tags}\n` +
    `- 语气可省略；如填写请用简短中文短语（例如“轻松调侃地说”）\n` +
    `- 只输出一行，不要输出多余内容（不要 Markdown/多段/额外括号）`
  );
}

function buildRoleplayInstruction(roleplay?: RoleplayPromptOptions): string {
  const roleName = String(roleplay?.roleName || '').trim();
  if (!roleName) {
    return '';
  }

  const lines = [
    '【角色视角要求】',
    `- 你必须以“${roleName}”的第一人称视角发言。`,
    '- 语气、态度、措辞要贴合该角色，不要跳出角色。',
    '- 不要提及你是 AI、语言模型或桌面宠物。',
  ];

  const characterCardContent = String(roleplay?.characterCardContent || '').trim();
  if (characterCardContent) {
    lines.push('【角色卡内容（参考）】');
    lines.push(characterCardContent);
  }

  return lines.join('\n');
}

function buildContextLines(chatContext: Array<{ role: string; name: string; message: string }>): string {
  return chatContext
    .map((msg) => `${msg.name}(${msg.role}): ${String(msg.message ?? '')}`)
    .join('\n');
}

/**
 * 构建完整的 LLM 提示词
 */
export function buildPrompt(
  style: CommentStyle,
  customPrompt: string,
  chatContext: Array<{ role: string; name: string; message: string }>,
  emotionCotEnabled = false,
  roleplay?: RoleplayPromptOptions,
): { system: string; user: string } {
  const { systemPrompt, responseFormat } = resolvePromptTemplate(style, customPrompt);
  const finalFormat = emotionCotEnabled ? appendEmotionCotFormat(responseFormat) : responseFormat;
  const roleplayInstruction = buildRoleplayInstruction(roleplay);

  // 构建聊天上下文摘要
  const contextLines = buildContextLines(chatContext);

  const systemParts = [systemPrompt];
  if (roleplayInstruction) {
    systemParts.push(roleplayInstruction);
  }
  systemParts.push(`回复格式要求：${finalFormat}`);

  const system = systemParts.join('\n\n');
  const user = `以下是最近的聊天记录，请对最新内容做出评论：\n\n${contextLines}`;

  return { system, user };
}

/**
 * 构建“手动聊天”提示词（参考最近聊天记录）
 */
export function buildChatPrompt(
  style: CommentStyle,
  customPrompt: string,
  chatContext: Array<{ role: string; name: string; message: string }>,
  userMessage: string,
  emotionCotEnabled = false,
  roleplay?: RoleplayPromptOptions,
): { system: string; user: string } {
  const { systemPrompt } = resolvePromptTemplate(style, customPrompt);
  const responseFormat = getChatResponseFormat(style);
  const finalFormat = emotionCotEnabled ? appendEmotionCotFormat(responseFormat) : responseFormat;
  const roleplayInstruction = buildRoleplayInstruction(roleplay);
  const roleName = String(roleplay?.roleName || '').trim();

  const contextLines = buildContextLines(chatContext);
  const safeUserMessage = String(userMessage || '').trim();

  const systemParts = [systemPrompt];
  if (roleplayInstruction) {
    systemParts.push(roleplayInstruction);
  }
  systemParts.push(`回复格式要求：${finalFormat}`);
  systemParts.push(roleName ? '你现在需要保持该角色设定与用户聊天。' : '你现在需要以桌面宠物的身份与用户聊天。');

  const system = systemParts.join('\n\n');

  const user =
    `以下是最近的聊天记录（仅供参考，不要逐字复述）：\n\n` +
    `${contextLines || '(无)'}\n\n` +
    `用户对你说：\n${safeUserMessage}\n\n` +
    `请直接回复用户：`;

  return { system, user };
}
