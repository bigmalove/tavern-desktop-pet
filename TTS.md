# 酒馆桌面宠物 - TTS 配音说明

本脚本的 TTS 功能完全参�?`galgame通用生成器` �?`tts` 模块实现，支持两种引擎：

- `LittleWhiteBox / xiaobaixTts`（小白X，豆包火山）
- `GPT-SoVITS v2ProPlus`（本�?局域网服务，`api_v2.py`�?
## 开启方�?
1. 打开「桌面宠物设置�?2. 进入「TTS 配音�?3. 勾选「启�?TTS 配音�?4. 选择 TTS 引擎、默认音�?5. （可选）勾选「自动播放（吐槽完成后朗读）�?
当「启�?TTS�?「自动播放」开启时，宠物的吐槽气泡在生成完成后会自动朗读�?
## 语气提示（contextTexts�?
当开启「表情设�?�?启用表情 COT 输出」时，LLM 会按如下格式输出�?
`桌面宠物[表情|语气]: 正文`

- `|语气`（可选）会作�?**LittleWhiteBox / xiaobaixTts** �?`contextTexts` 传入，用于提示说话语�?- �?LLM 未输�?`|语气`，则会使用「表情设置」里该表情的 **TTS 默认语气** 作为兜底（可为空�?
## LittleWhiteBox（小白X）引�?
### 依赖

- 需要酒馆侧已安装并启用对应 TTS 扩展（全局对象通常�?`xiaobaixTts` �?`LittleWhiteBox`�?
### 音色列表来源

按优先级尝试�?
1. `GET /user/files/LittleWhiteBox_TTS.json` 中的 `volc.mySpeakers`
2. `xiaobaixTts.getConfig().volc.mySpeakers`
3. `XB_TTS_VOICE_DATA`（若存在�?4. 内置的免费音色列表（`female_1 ~ male_4`�?
如果你发现「默认音色」下拉为空，优先检�?`LittleWhiteBox_TTS.json` 是否存在、是否可被访问�?
## GPT-SoVITS v2ProPlus 引擎

### 依赖

- 本地或局域网运行 GPT-SoVITS v2ProPlus（`api_v2.py`），并能从酒馆页面访问到 `API 地址`（默�?`http://127.0.0.1:9880`�?
### 配置步骤

1. 在「TTS 配音」里�?`TTS 引擎` 切换�?`GPT-SoVITS v2ProPlus`
2. 填写 `API 地址`
3. 需要跨域时勾选「使用酒馆代理（/proxy）�?4. 在「音色列表（JSON）」粘贴你的音色配置，点击「保存音色列表�?5. 选择「默认音色」，点击「试听�?
音色列表 JSON 示例（最小可用）�?
```json
[
  {
    "name": "示例音色",
    "refAudioPath": "wavs/xxx.wav",
    "promptText": "示例参考文�?,
    "promptLang": "zh"
  }
]
```

说明�?
- `name`：音色名。建议设为「角色名」，方便按角色绑定或默认选择�?- `refAudioPath`：参考音频路径（必须）�?- `promptText` / `promptLang`：参考文本及其语言�?
## 口型同步（LipSync�?
本脚本包含口型同步实现：

- TTS 播放时会使用 Web Audio API 分析音量，并持续调用 `Live2DManager.setMouthOpen(...)` 驱动口型参数
- 对跨域音频会尝试走酒馆的 `getCorsProxyUrl/enableCorsProxy/corsProxy.getProxyUrl`，否则回退�?`/proxy?url=...`

注意�?
- 浏览器可能会拦截未经过用户交互的音频播放。遇到「播放被拦截」时，先在页面上点击一次（或用设置里的「试听」按钮触发一次）再试�?
## 常见问题

### 1) 听不到声�?
- 确认已开启「启�?TTS 配音�?- LittleWhiteBox：确认扩展已启用，且 `LittleWhiteBox_TTS.json` 可用（或扩展内有音色�?- GPT-SoVITS：确�?`API 地址` 可访问；跨域时勾选「使用酒馆代理（/proxy）�?
### 2) GPT-SoVITS 提示缺少 refAudioPath

- 你选择的音色条目没�?`refAudioPath`
- 请在音色列表 JSON 中补齐该字段，保存后重新试听



## EdgeTTS ֱ��ģʽ��MVP��

### Ŀ��

- ����װ ST Server Plugin / Extras��
- ǰ��ֱ��ͨ�� WebSocket ���� EdgeTTS �ϳɽӿڡ�
- �������е��������䣺PetContainer -> TTSManager.speak(...)��

### ������ʽ

- ��ɫ�б���
  - ������ȡԶ�� voices list��
  - ��ȡʧ��ʱ�Զ����˵����ó�����ɫ�б��������ж������̣���
- �����ϳɣ�
  - ǰ�˽��� wss://speech.platform.bing.com/.../edge/v1 ���ӡ�
  - ���� speech.config + ssml��ƴ����Ƶ֡�󱾵ز��š�
- ����ͬ����
  - ������������ LipSyncManager���㷨δ�ġ�

### ���ݲ���

- ���� Edge-only Ӳ���ơ�
- �������ִ�������ȳ���ֱ����
- ʧ��ʱ������ȷ��ʾ�������л� Edge ��������⡣

### ʧ���Ų�

1. ˢ����ɫʧ�ܣ�
   - ��������Ƿ�ɷ��� speech.platform.bing.com��
   - ϵͳ���Զ����˱�����ɫ���Կ��Ȳ��Բ��š�
2. ����ʧ�� / �Զ�����ʧ�ܣ�
   - ���ֶ����һ��ҳ�����ԣ�������Զ����Ų������ƣ���
   - �鿴����̨�Ƿ��� WebSocket ���ֻ������ش���
3. ���������ʧ�ܣ�
   - ����ʾ�л��� Edge ��������⣬ȷ���Ƿ�Ϊ��������ݲ��졣

### ����˵��

- EdgeTTS ֱ��ʹ�õ��Ƿǹٷ�����Э�飬����˲��Ա�����ܵ���ʧЧ��
- ��ʵ�ֽ������ԣ�Զ��ʧ����ʾ + ������ɫ���� + �����̲�������
