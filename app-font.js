const APP_FONT_KEY = 'tijian-font-family';
const APP_FONT_OPTIONS = [['zzz', '绝区零字体'], ['system', '系统字体']];
let appFont = readAppFont();

function readAppFont() {
  try { return localStorage.getItem(APP_FONT_KEY) === 'system' ? 'system' : 'zzz'; }
  catch { return 'zzz'; }
}

function applyAppFont() {
  document.documentElement.dataset.fontFamily = appFont;
}

function fontSettingsHtml() {
  return `<section class="card settings-card font-family-card">
    <div><h2>应用字体</h2><p>覆盖首页、题目、选项、解析和结算。字体已内置，离线也能用。</p></div>
    <div class="font-family-options" role="group" aria-label="应用字体">
      ${APP_FONT_OPTIONS.map(([value, label]) => `<button type="button" data-font-choice="${value}" aria-pressed="${appFont === value}" class="${appFont === value ? 'active' : ''}">${label}<small>${value === 'zzz' ? '你提供的印品鸿蒙体' : '跟随手机或电脑的默认字体'}</small></button>`).join('')}
    </div>
    <div class="font-family-preview"><strong>题间 · 数控练习</strong><p>学会一道，掌握一类。G01 / X Y Z / 0123456789</p></div>
    <p class="font-family-status" role="status">当前：${APP_FONT_OPTIONS.find(([value]) => value === appFont)[1]}，选择会自动保存在本机。</p>
  </section>`;
}

function refreshFontControls() {
  document.querySelectorAll('[data-font-choice]').forEach(button => {
    const active = button.dataset.fontChoice === appFont;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function bindFontSettings() {
  document.querySelectorAll('[data-font-choice]').forEach(button => button.onclick = () => {
    const choice = button.dataset.fontChoice;
    if (!APP_FONT_OPTIONS.some(([value]) => value === choice)) return;
    appFont = choice;
    let saved = true;
    try { localStorage.setItem(APP_FONT_KEY, appFont); } catch { saved = false; }
    applyAppFont();
    refreshFontControls();
    const status = document.querySelector('.font-family-status');
    if (status) status.textContent = `当前：${button.firstChild.textContent}，${saved ? '已自动保存。' : '本次已切换，当前设备暂时无法保存设置。'}`;
  });
}

window.addEventListener('storage', event => {
  if (event.key !== APP_FONT_KEY && event.key !== null) return;
  appFont = readAppFont();
  applyAppFont();
  refreshFontControls();
  const status = document.querySelector('.font-family-status');
  if (status) status.textContent = `当前：${APP_FONT_OPTIONS.find(([value]) => value === appFont)[1]}，已与本机其他窗口保持一致。`;
});

applyAppFont();
