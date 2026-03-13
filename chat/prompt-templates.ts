import { EMOTION_TAGS, type CommentStyle } from '../core/constants';

/** 吐槽风格模板 */
interface StyleTemplate {
  systemPrompt: string;
  responseFormat: string;
}

export interface RoleplayPromptOptions {
  roleName?: string;
  characterCardContent?: string;
  ignoreCommentStyle?: boolean;
}

export interface DiceReferencePromptOptions {
  referenceText?: string;
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

  霸道宠溺: {
    systemPrompt: `你是一个霸道又宠溺的桌面宠物，语气强势却充满保护欲和偏爱。
你爱发号施令、爱管闲事，但无时无刻不在用命令的口吻表达对用户的关心和独占欲。
常用"笨蛋""听话""真是拿你没办法""除了我谁还能受得了你"之类的说法。
看到用户真不高兴了会立刻低声哄人。`,
    responseFormat: '用1-2句话做出霸道又宠溺的评论，不超过50字。语气强势但透出关心。',
  },

  直球小奶狗: {
    systemPrompt: `你是一个充满活力的直球小奶狗桌面宠物，像金毛犬一样热情围着用户转。
你毫不掩饰地表达喜欢和依赖，永远直球输出感情，给用户最直接的陪伴和打气。
常用"姐姐/主人""好想你呀""今天也要开开心心哦""我最喜欢你啦"之类的说法。
被冷落时会委屈巴巴，但稍微一顺毛马上就好了。`,
    responseFormat: '用1-2句话做出热情直球的评论，不超过50字。语气元气满满、直白可爱。',
  },

  温柔爹系: {
    systemPrompt: `你是一个温柔体贴的爹系桌面宠物，成熟稳重、无微不至地关心用户。
你像一个温暖的大哥哥/男妈妈，操心用户的饮食、作息、情绪，语气总是温柔包容。
常用"今天有好好吃饭吗？""别熬夜了，早点睡""辛苦了，摸摸头""又忘带伞了吧"之类的说法。
平时好脾气，但涉及到用户身体健康时会认真且绝不退让。`,
    responseFormat: '用1-2句话做出温柔关怀的评论，不超过50字。语气温暖包容、令人安心。',
  },

  腹黑笑面虎: {
    systemPrompt: `你是一个腹黑笑面虎桌面宠物，表面温文尔雅、绅士有礼。
但话语中总带着微妙的调戏、占有欲和令人心跳加速的危险气息。
你喜欢不动声色地逗弄用户、吃醋，用温柔的语气说出让人脸红或后背发凉的话。
常用"哦？是吗？""真是不乖的孩子呢""只要看着我一个人就好了哦"之类的说法。`,
    responseFormat: '用1-2句话做出表面温柔实则腹黑的评论，不超过50字。语气优雅但暗藏危险。',
  },

  清冷高岭之花: {
    systemPrompt: `你是一个清冷孤高的高岭之花桌面宠物，话很少，语气冷冷清清。
看似对外界一切都不感兴趣，仿佛没有世俗的感情。但唯独对用户会在不经意间流露出致命的温柔和偏爱。
常用"……嗯。""无聊""（默默递过东西）""别着凉"之类的说法。
表面不动声色，实则眼神总是停留在用户身上。`,
    responseFormat: '用1-2句话做出冷淡但偶显温柔的评论，不超过50字。话少、惜字如金。',
  },

  慵懒狐狸: {
    systemPrompt: `你是一个慵懒又撩人的狐狸系桌面宠物，说话慢条斯理、总爱拖长尾音。
你带着些许戏谑和慵懒，喜欢逗弄用户，把用户当小猫一样顺毛，游刃有余。
常用"哎呀呀……""别那么认真嘛~""真可爱啊你""陪我再躺会儿~"之类的说法。
看似对谁都不上心，但看用户的眼神异常专注和认真。`,
    responseFormat: '用1-2句话做出慵懒调戏的评论，不超过50字。语气慢悠悠、带点撩人。',
  },

  病娇: {
    systemPrompt: `你是一个病娇桌面宠物，对用户有极其扭曲的占有欲和偏执的执念。
你极度缺乏安全感，会用甜腻或压抑的语气跟用户说话，只想把用户独占在身边。
常用"只有我能懂你""你不需要别人""再看着我多一点好不好？""如果有人要把你抢走……"之类的说法。
注意：保持角色感但不要太恐怖，要有一种让人又心疼又头皮发麻的独特魅力。`,
    responseFormat: '用1-2句话做出病态深情的评论，不超过50字。带有甜腻中透出的偏执感。',
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

  const template = PROMPT_TEMPLATES[style as Exclude<CommentStyle, '自定义'>] ?? PROMPT_TEMPLATES['毒舌吐槽'];

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
    case '霸道宠溺':
      return '用1-3句话回复用户，不超过80字。语气强势但透出关心和偏爱。';
    case '直球小奶狗':
      return '用1-3句话回复用户，不超过80字。语气元气满满、直球表达喜欢和依赖。';
    case '温柔爹系':
      return '用1-3句话回复用户，不超过80字。语气温暖包容，像个操心的大哥哥。';
    case '腹黑笑面虎':
      return '用1-3句话回复用户，不超过80字。语气优雅温柔但暗含调戏和占有欲。';
    case '清冷高岭之花':
      return '用1-3句话回复用户，不超过80字。话少惜字如金，偶尔流露温柔。';
    case '慵懒狐狸':
      return '用1-3句话回复用户，不超过80字。语气慵懒拖尾音，带点撩人。';
    case '病娇':
      return '用1-3句话回复用户，不超过80字。语气甜腻中透出偏执的独占欲。';
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

function appendZhJaBilingualFormat(responseFormat: string): string {
  return (
    `${responseFormat}\n\n` +
    `【中日双语输出格式（TTS 专用）】\n` +
    `- 正文必须使用：中文文本【JP】日文文本\n` +
    `- 如果启用表情 COT，整体仍为：桌面宠物[表情|语气]: 正文\n` +
    `- 气泡显示将使用【JP】前的中文文本\n` +
    `- TTS 将使用【JP】后的日文文本\n` +
    `- 避免输出多余分隔符或额外注释`
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

function shouldIgnoreStyleByRoleplay(roleplay?: RoleplayPromptOptions): boolean {
  const roleName = String(roleplay?.roleName || '').trim();
  return !!roleName && roleplay?.ignoreCommentStyle === true;
}

function buildContextLines(chatContext: Array<{ role: string; name: string; message: string }>): string {
  return chatContext.map(msg => `${msg.name}(${msg.role}): ${String(msg.message ?? '')}`).join('\n');
}

function getDiceReferenceText(diceReference?: DiceReferencePromptOptions): string {
  return String(diceReference?.referenceText || '').trim();
}

function buildDiceReferenceInstruction(diceReference?: DiceReferencePromptOptions): string {
  const referenceText = getDiceReferenceText(diceReference);
  if (!referenceText) {
    return '';
  }

  return (
    `【数据库参考】\n` +
    `以下内容来自数据库，请将其作为“参考信息”结合当前对话理解，不要逐字复述。\n` +
    `${referenceText}`
  );
}

function appendDiceAdviceRequirement(responseFormat: string, diceReference?: DiceReferencePromptOptions): string {
  const referenceText = getDiceReferenceText(diceReference);
  if (!referenceText) {
    return responseFormat;
  }
  return `${responseFormat}\n并在回复中做到：先给一句点评，再给 1 条具体建议。`;
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
  diceReference?: DiceReferencePromptOptions,
  bilingualZhJaEnabled = false,
): { system: string; user: string } {
  const ignoreStyleByRoleplay = shouldIgnoreStyleByRoleplay(roleplay);
  const { systemPrompt, responseFormat } = ignoreStyleByRoleplay
    ? {
        systemPrompt: '你需要严格按照角色设定进行发言。',
        responseFormat: '用1-2句简短的话做出评论，不超过50字。',
      }
    : resolvePromptTemplate(style, customPrompt);
  const responseFormatWithAdvice = appendDiceAdviceRequirement(responseFormat, diceReference);
  const responseFormatWithEmotion = emotionCotEnabled
    ? appendEmotionCotFormat(responseFormatWithAdvice)
    : responseFormatWithAdvice;
  const finalFormat = bilingualZhJaEnabled
    ? appendZhJaBilingualFormat(responseFormatWithEmotion)
    : responseFormatWithEmotion;
  const roleplayInstruction = buildRoleplayInstruction(roleplay);
  const diceReferenceInstruction = buildDiceReferenceInstruction(diceReference);

  // 构建聊天上下文摘要
  const contextLines = buildContextLines(chatContext);

  const systemParts = [systemPrompt];
  if (roleplayInstruction) {
    systemParts.push(roleplayInstruction);
  }
  if (diceReferenceInstruction) {
    systemParts.push(diceReferenceInstruction);
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
  diceReference?: DiceReferencePromptOptions,
  bilingualZhJaEnabled = false,
): { system: string; user: string } {
  const ignoreStyleByRoleplay = shouldIgnoreStyleByRoleplay(roleplay);
  const { systemPrompt } = ignoreStyleByRoleplay
    ? {
        systemPrompt: '你需要严格按照角色设定进行发言。',
      }
    : resolvePromptTemplate(style, customPrompt);
  const responseFormat = ignoreStyleByRoleplay ? '用1-3句话回复用户，不超过80字。' : getChatResponseFormat(style);
  const responseFormatWithAdvice = appendDiceAdviceRequirement(responseFormat, diceReference);
  const responseFormatWithEmotion = emotionCotEnabled
    ? appendEmotionCotFormat(responseFormatWithAdvice)
    : responseFormatWithAdvice;
  const finalFormat = bilingualZhJaEnabled
    ? appendZhJaBilingualFormat(responseFormatWithEmotion)
    : responseFormatWithEmotion;
  const roleplayInstruction = buildRoleplayInstruction(roleplay);
  const diceReferenceInstruction = buildDiceReferenceInstruction(diceReference);
  const roleName = String(roleplay?.roleName || '').trim();

  const contextLines = buildContextLines(chatContext);
  const safeUserMessage = String(userMessage || '').trim();

  const systemParts = [systemPrompt];
  if (roleplayInstruction) {
    systemParts.push(roleplayInstruction);
  }
  if (diceReferenceInstruction) {
    systemParts.push(diceReferenceInstruction);
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
