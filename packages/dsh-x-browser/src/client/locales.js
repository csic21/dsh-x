export const NS = 'dshXBrowser'
export const en = {
  title: 'AI Browser', open: 'Open embedded browser', description: 'Browse beside your conversation. Desktop only; experimental.',
  address: 'Website address', go: 'Go', back: 'Back', forward: 'Forward', reload: 'Reload', stop: 'Stop loading', newTab: 'New browser tab',
  enable: 'Allow AI on this tab', takeover: 'Take over / Stop AI', manual: 'You are in control', ready: 'AI access enabled', running: 'AI is using this visible tab',
  loading: 'Starting embedded Chromium…', unavailable: 'Embedded browser unavailable', disconnected: 'AI stopped: connection lost', hidden: 'AI stopped: tab hidden', stopped: 'AI stopped',
  closed: 'AI stopped: tab closed', 'turn-ended': 'AI stopped: authorized turn ended', 'workspace-changed': 'AI stopped: workspace changed', 'native-run-ended': 'AI stopped: native run ended', 'document-changed': 'AI stopped: page changed',
  consent: 'Allow the current DSH conversation to read this page and request actions in this visible tab. Actions ask for approval. Page observations become conversation history and may be sent to your configured DSH model or an explicitly enabled OpenCode model for this run. Passwords, payment details and sign-in codes must be entered manually.',
  grant: 'Allow page access', cancel: 'Cancel', experimental: 'Experimental · desktop validation required',
  desktopOnly: 'This feature needs a compatible DSH Desktop app. Web preview cannot embed Chromium. No external browser was opened.',
  start: 'Enter a website address to start browsing.', privacy: 'Permissions, downloads, HTTP authentication and native pop-ups stay blocked by the Desktop shell.',
  limitations: 'AI sees visible top-frame text and plain controls. Frames, canvas and closed shadow roots may need your help. Manual input is yours after Take over.',
  details: 'Technical details', error: 'The browser action could not finish. AI control is disabled; check the page before retrying.',
}
export const zh = {
  title: 'AI 浏览器', open: '打开内嵌浏览器', description: '在对话旁边浏览网页。仅限桌面端，实验功能。',
  address: '网页地址', go: '前往', back: '后退', forward: '前进', reload: '重新加载', stop: '停止加载', newTab: '新建浏览器标签页',
  enable: '允许 AI 操作此页', takeover: '接管 / 停止 AI', manual: '由你控制', ready: '已允许 AI 访问', running: 'AI 正在操作此可见页面',
  loading: '正在启动内嵌 Chromium…', unavailable: '内嵌浏览器不可用', disconnected: 'AI 已停止：连接中断', hidden: 'AI 已停止：标签页已隐藏', stopped: 'AI 已停止',
  closed: 'AI 已停止：标签页已关闭', 'turn-ended': 'AI 已停止：已授权的对话轮次结束', 'workspace-changed': 'AI 已停止：工作区改变', 'native-run-ended': 'AI 已停止：原生运行结束', 'document-changed': 'AI 已停止：页面改变',
  consent: '允许当前 DSH 对话读取此页面，并请求操作这个可见标签页。操作前会请求批准；页面观察结果会进入对话记录，并可能发送给你配置的 DSH 模型或本次明确启用的 OpenCode 模型。密码、支付资料和登录验证码请手动输入。',
  grant: '允许访问页面', cancel: '取消', experimental: '实验功能 · 尚需桌面实机验证',
  desktopOnly: '此功能需要兼容的 DSH 桌面应用。网页版预览不能内嵌 Chromium，也不会打开外部浏览器。',
  start: '输入网页地址，开始浏览。', privacy: '桌面内核继续阻止权限申请、下载、HTTP 身份验证及原生弹窗。',
  limitations: 'AI 只能读取顶层页面的可见文字和普通控件。框架、画布和封闭 Shadow DOM 可能需要你协助。操作网页前可先点「接管」。',
  details: '技术详情', error: '浏览器操作未完成，AI 控制已停用。重试前请先确认页面状态。',
}
